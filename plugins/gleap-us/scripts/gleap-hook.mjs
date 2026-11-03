#!/usr/bin/env node
// Gleap coding-agent hook (Claude Code + Codex). Node >= 18, no dependencies.
//
//   node gleap-hook.mjs <plan|stop|session-start|tool-result> [--harness claude-code|codex]
//   node gleap-hook.mjs mcp-headers [--region eu|us] [--project <dir>]
//
// Reads the hook event JSON on stdin, finds `.gleap/session.json` by walking up
// from the event's `cwd`, and mirrors the agent's plan / last message to the
// Gleap coding session it belongs to:
//
//   plan           POST {apiBase}/v3/kai-agent-hooks/plan           { items, explanation? }
//   stop           POST {apiBase}/v3/kai-agent-hooks/stop           { lastMessage?, harness }
//   session-start  POST {apiBase}/v3/kai-agent-hooks/session-start  { harness, source? }
//   tool-result    (Claude Code) a Gleap MCP result said STOP: the session is
//                  over, so `.gleap/session.json` is removed. Nothing is sent.
//
// `mcp-headers` is the Gleap MCP server's `headersHelper` (.mcp.json): it reads
// no stdin and prints `{"x-gleap-session-id": "<id>"}` for the session in the
// project's `.gleap/session.json`, or `{}` (see mcpHeadersFor).
//
// `.gleap/session.json` only exists for sessions started from Gleap (the agent
// writes it from the `hook` block of a report_progress
// result). No file, an expired token or a non-Gleap host: the script does
// nothing. It never blocks or fails the agent: every path exits 0 within ~3.5 s,
// prints nothing except `{}` for Stop (Codex requires JSON there) and the
// headers object for mcp-headers, and never prints the token.

import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const EVENTS = new Set(["plan", "stop", "session-start", "tool-result"]);
const SESSION_ID_RE = /^[a-f0-9]{24}$/i;
/**
 * The Gleap MCP's STOP sentence (the session was stopped in Gleap: a teammate
 * took the ticket over, replied, or stopped it), the current wording and the
 * one before it, at the START of a result: the fallback for an older Gleap MCP
 * without `structuredContent.gleapStop` (see isGleapStopResult). Kai Code's
 * runner uses the same rule.
 */
export const GLEAP_STOP_PATTERN = /^\s*STOP: (this ticket is no longer yours in Gleap|your operator stopped this session in Gleap)/;
/**
 * The Gleap MCP server's tool names: `mcp__gleap__…` / `mcp__gleap-us__…`
 * (added with `claude mcp add`) and this plugin's own server
 * (`mcp__plugin_gleap_gleap__…`, `mcp__plugin_gleap-us_gleap__…`).
 */
const GLEAP_MCP_TOOL = /^mcp__(plugin_gleap(-us)?_)?gleap(-us)?__./i;
const REQUEST_TIMEOUT_MS = 2000;
const HARD_EXIT_MS = 3500;
const MAX_STDIN_BYTES = 2_000_000;
const MAX_ITEMS = 50;
const MAX_ITEM_CHARS = 300;
const MAX_LAST_MESSAGE_CHARS = 4000;
const STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LOCK_WAIT_MS = 1000;
const LOCK_STALE_MS = 5000;

const debug = (...args) => {
  if (process.env.GLEAP_HOOK_DEBUG === "1") process.stderr.write(`[gleap-hook] ${args.join(" ")}\n`);
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for the local smoke test)

export const normalizeStatus = (raw) => {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (s === "in_progress" || s === "inprogress" || s === "active" || s === "doing" || s === "running") return "in_progress";
  if (s === "completed" || s === "complete" || s === "done" || s === "finished") return "completed";
  if (s === "cancelled" || s === "canceled" || s === "skipped") return "cancelled";
  return "pending";
};

const clip = (text, max) => {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const toItems = (list, contentOf) =>
  (Array.isArray(list) ? list : [])
    .map((entry) => ({ content: clip(contentOf(entry), MAX_ITEM_CHARS), status: normalizeStatus(entry?.status) }))
    .filter((item) => item.content)
    .slice(0, MAX_ITEMS);

const asObject = (value) => {
  if (value && typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const taskIdOf = (input) => {
  const id = input?.taskId ?? input?.task_id ?? input?.id;
  return id === undefined || id === null ? null : String(id);
};

/**
 * Maps one PostToolUse event to `{ items, explanation? }`, or null when the
 * tool is not a plan tool. `state` is the per-session task list kept for
 * TaskCreate / TaskUpdate (mutated in place; the caller persists it).
 */
export const planFromEvent = (event, state) => {
  const tool = String(event?.tool_name ?? "");
  const input = asObject(event?.tool_input);

  // An MCP plan tool (Gleap's own `update_plan`) already reached Gleap directly.
  if (tool.startsWith("mcp__")) return null;

  if (tool === "TodoWrite") {
    return { items: toItems(input.todos, (t) => t?.content ?? t?.activeForm) };
  }

  if (tool === "update_plan") {
    const items = toItems(input.plan ?? input.items, (p) => p?.step ?? p?.content);
    const explanation = typeof input.explanation === "string" && input.explanation.trim() ? clip(input.explanation, 500) : undefined;
    return explanation ? { items, explanation } : { items };
  }

  if (tool === "TaskCreate" || tool === "TaskUpdate") {
    state.tasks ||= {};
    state.order ||= [];
    if (tool === "TaskCreate") {
      const response = asObject(event?.tool_response);
      const created = asObject(response.task);
      // Claude Code numbers tasks 1, 2, 3 … per session; fall back to that when
      // the response carries no id.
      const id = created.id !== undefined ? String(created.id) : String((state.lastId ?? 0) + 1);
      const numeric = Number(id);
      if (Number.isFinite(numeric)) state.lastId = Math.max(state.lastId ?? 0, numeric);
      if (!state.order.includes(id)) state.order.push(id);
      state.tasks[id] = {
        content: clip(input.subject ?? created.subject ?? input.description, MAX_ITEM_CHARS),
        status: normalizeStatus(input.status ?? "pending"),
      };
    } else {
      const id = taskIdOf(input);
      if (!id) return null;
      if (String(input.status ?? "").toLowerCase() === "deleted") {
        delete state.tasks[id];
        state.order = state.order.filter((x) => x !== id);
      } else {
        const task = state.tasks[id] ?? { content: "", status: "pending" };
        if (!state.tasks[id]) state.order.push(id);
        if (input.subject) task.content = clip(input.subject, MAX_ITEM_CHARS);
        if (input.status) task.status = normalizeStatus(input.status);
        if (!task.content) task.content = `Task ${id}`;
        state.tasks[id] = task;
      }
    }
    return {
      items: state.order
        .map((id) => state.tasks[id])
        .filter((t) => t && t.content)
        .slice(0, MAX_ITEMS)
        .map((t) => ({ content: t.content, status: t.status })),
    };
  }

  return null;
};

/** Only Gleap hosts get the token (a planted session.json must not exfiltrate). */
export const isAllowedApiBase = (apiBase, env = process.env) => {
  let url;
  try {
    url = new URL(String(apiBase));
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  if (local) return env.GLEAP_HOOK_ALLOW_LOCAL === "1";
  if (url.protocol !== "https:") return false;
  // EU sessions carry dashapi.gleap.io, US sessions dashapi.us.gleap.ai.
  return ["gleap.io", "gleap.ai"].some((d) => host === d || host.endsWith(`.${d}`));
};

export const hookUrl = (apiBase, event) => {
  const base = String(apiBase).replace(/\/+$/, "").replace(/\/v3$/, "");
  return `${base}/v3/kai-agent-hooks/${event}`;
};

/** Walks up from `start` to the first `.gleap/session.json`, stopping at the repository root. */
export const findSessionFile = (start) => {
  let dir = start;
  for (let depth = 0; depth < 64 && dir; depth += 1) {
    const candidate = join(dir, ".gleap", "session.json");
    if (existsSync(candidate)) return candidate;
    if (existsSync(join(dir, ".git"))) return null;
    const parent = dirname(dir);
    if (parent === dir || dir === parse(dir).root) return null;
    dir = parent;
  }
  return null;
};

/**
 * The session file holds a bearer token: a copy written with the default
 * umask (0644) is readable by every local user. Tighten it to 0600 before use.
 * Best effort: Windows has no POSIX modes, and a file we do not own stays as it is.
 */
export const tightenSessionFile = (file, platform = process.platform) => {
  if (platform === "win32") return false;
  try {
    if ((statSync(file).mode & 0o077) === 0) return false;
    chmodSync(file, 0o600);
    return true;
  } catch {
    return false;
  }
};

export const readSession = (file, now = Date.now()) => {
  let session;
  try {
    session = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  if (!session || typeof session.token !== "string" || !session.token || typeof session.apiBase !== "string") return null;
  if (session.expiresAt) {
    const expires = Date.parse(session.expiresAt);
    if (Number.isFinite(expires) && expires <= now) return null;
  }
  return session;
};

/** `eu` or `us` for a Gleap URL (`*.us.gleap.ai` is the US region, every other host the EU), null when unparseable. */
export const regionOf = (url) => {
  try {
    return new URL(String(url)).hostname.toLowerCase().split(".").includes("us") ? "us" : "eu";
  } catch {
    return null;
  }
};

/** This plugin's own folder (where this script lives), never a project. */
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The folder Claude Code works in, for the headers helper. Claude Code runs a
 * plugin's `headersHelper` inside the plugin's folder (PWD included), so the
 * project comes in as `--project "${CLAUDE_PROJECT_DIR}"`, which Claude Code
 * fills in; CLAUDE_PROJECT_DIR / PWD / cwd for other callers. Never the
 * plugin's own folder.
 */
export const projectDirOf = ({ project, env = process.env, cwd = process.cwd(), pluginRoot = PLUGIN_ROOT } = {}) => {
  for (const candidate of [project, env.CLAUDE_PROJECT_DIR, env.PWD, cwd]) {
    if (typeof candidate !== "string" || !candidate || !isAbsolute(candidate)) continue;
    const dir = resolve(candidate);
    if (dir === pluginRoot || dir.startsWith(`${pluginRoot}${sep}`)) continue;
    return dir;
  }
  return null;
};

/**
 * The headers Claude Code sends with every request to the Gleap MCP server
 * (the plugin's `headersHelper`, run when the server connects): the coding
 * session this repository works for, so its writes are booked to the session
 * and checked by Gleap's guard. `{}` (no header, as before) without a session
 * file, when it expired, is not a Gleap session, or belongs to the other
 * region (`region`: the plugin's own, from its `--region`). Never the token.
 */
export const mcpHeadersFor = ({ project, region, env = process.env, cwd = process.cwd(), now = Date.now() } = {}) => {
  const dir = projectDirOf({ project, env, cwd });
  const file = dir ? findSessionFile(dir) : null;
  const session = file ? readSession(file, now) : null;
  if (!session || !SESSION_ID_RE.test(String(session.sessionId ?? ""))) return {};
  if (!isAllowedApiBase(session.apiBase, env)) return {};
  if ((region === "eu" || region === "us") && regionOf(session.apiBase) !== region) return {};
  return { "x-gleap-session-id": session.sessionId };
};

/** The objects a PostToolUse `tool_response` may carry the MCP result's `structuredContent` on. */
const structuredContentsOf = (response) => {
  const out = [];
  for (const holder of [response, response?.result]) {
    const structured = holder && typeof holder === "object" && !Array.isArray(holder) ? holder.structuredContent : undefined;
    if (structured && typeof structured === "object" && !Array.isArray(structured)) out.push(structured);
  }
  return out;
};

/** The first text of a tool result: a string, or the first text block of its content. */
const firstResultText = (response) => {
  for (const source of [response, response?.result]) {
    if (typeof source === "string") return source;
    const list = Array.isArray(source) ? source : Array.isArray(source?.content) ? source.content : null;
    if (!list) continue;
    for (const block of list) {
      if (block && block.type === "text" && typeof block.text === "string") return block.text;
    }
  }
  return undefined;
};

/**
 * Whether a PostToolUse event is the Gleap MCP saying STOP: a tool of the
 * Gleap MCP server whose result carries `structuredContent.gleapStop` (only
 * the Gleap MCP sets it), or, from an older Gleap MCP, whose text starts with
 * the STOP sentence. Never the sentence found elsewhere in a result: a
 * customer can write it into a message, another tool can print it.
 */
export const isGleapStopResult = (event) => {
  if (!GLEAP_MCP_TOOL.test(String(event?.tool_name ?? ""))) return false;
  const response = event?.tool_response;
  if (structuredContentsOf(response).some((structured) => structured.gleapStop === true)) return true;
  const text = firstResultText(response);
  return typeof text === "string" && GLEAP_STOP_PATTERN.test(text);
};

/**
 * A STOP ends the session: its file goes, so the next Claude Code session in
 * this repository does not name a stopped session. A STOP for another session
 * (the tool named a different `sessionId`) leaves the file alone.
 */
export const dropStoppedSession = (sessionFile, event) => {
  const named = String(asObject(event?.tool_input).sessionId ?? "").trim();
  let current = "";
  try {
    current = String(JSON.parse(readFileSync(sessionFile, "utf8"))?.sessionId ?? "");
  } catch {
    // unreadable: it goes too
  }
  if (named && current && named.toLowerCase() !== current.toLowerCase()) return false;
  try {
    unlinkSync(sessionFile);
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// I/O

const readStdin = () =>
  new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    let size = 0;
    const chunks = [];
    const done = () => resolve(Buffer.concat(chunks).toString("utf8"));
    const timer = setTimeout(done, 1000);
    timer.unref();
    process.stdin.on("data", (chunk) => {
      size += chunk.length;
      if (size <= MAX_STDIN_BYTES) chunks.push(chunk);
    });
    process.stdin.on("end", () => {
      clearTimeout(timer);
      done();
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      resolve("");
    });
  });

const safeName = (value) => String(value || "default").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80);

const statePath = (sessionFile, harnessSessionId) => join(dirname(sessionFile), `hook-tasks-${safeName(harnessSessionId)}.json`);

const loadState = (path) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
};

const saveState = (path, state) => {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(state));
  } catch {
    // best effort
  }
};

const pruneOldState = (dir, now = Date.now()) => {
  try {
    for (const name of readdirSync(dir)) {
      if (!name.startsWith("hook-tasks-")) continue;
      const p = join(dir, name);
      if (now - statSync(p).mtimeMs > STATE_TTL_MS) unlinkSync(p);
    }
  } catch {
    // best effort
  }
};

// Parallel tool calls fire their PostToolUse hooks at the same time; a lock
// directory serialises read-modify-write of the task state and the POST, so
// the last request Gleap gets carries the complete, latest list.
const withLock = async (path, fn) => {
  const lock = `${path}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  let held = false;
  while (!held && Date.now() < deadline) {
    try {
      mkdirSync(lock);
      held = true;
    } catch (err) {
      if (err?.code !== "EEXIST") break;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) rmSync(lock, { recursive: true, force: true });
      } catch {
        // gone already
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  try {
    return await fn();
  } finally {
    if (held) rmSync(lock, { recursive: true, force: true });
  }
};

const post = async (url, token, body) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    debug("POST", url, "->", String(res.status));
  } catch (err) {
    debug("POST", url, "failed:", err?.name === "AbortError" ? "timeout" : String(err?.code ?? err?.message ?? err));
  } finally {
    clearTimeout(timer);
  }
};

const harnessFrom = (argv) => {
  const i = argv.indexOf("--harness");
  const value = i >= 0 ? argv[i + 1] : undefined;
  if (value === "codex" || value === "claude-code") return value;
  if (process.env.CLAUDE_PLUGIN_ROOT) return "claude-code";
  if (process.env.PLUGIN_ROOT) return "codex";
  return undefined;
};

export const run = async (argv = process.argv.slice(2)) => {
  const kind = argv[0];
  if (!EVENTS.has(kind)) return;
  const harness = harnessFrom(argv);

  const raw = await readStdin();
  let event = {};
  try {
    event = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return;
  }

  const cwd = typeof event.cwd === "string" && event.cwd ? event.cwd : process.cwd();
  const sessionFile = findSessionFile(cwd);
  if (!sessionFile) return debug("no .gleap/session.json above", cwd);
  if (kind === "tool-result") {
    if (!isGleapStopResult(event)) return;
    return debug(dropStoppedSession(sessionFile, event) ? "STOP: removed session.json" : "STOP for another session; session.json kept");
  }
  if (tightenSessionFile(sessionFile)) debug("session.json was readable by others; set to 0600");
  const session = readSession(sessionFile);
  if (!session) return debug("session.json unreadable or expired");
  if (!isAllowedApiBase(session.apiBase)) return debug("apiBase is not a Gleap host; skipped");
  const url = hookUrl(session.apiBase, kind);

  if (kind === "plan") {
    const path = statePath(sessionFile, event.session_id);
    return withLock(path, async () => {
      const state = loadState(path);
      const plan = planFromEvent(event, state);
      if (!plan) return debug("not a plan tool:", String(event.tool_name ?? ""));
      if (event.tool_name === "TaskCreate" || event.tool_name === "TaskUpdate") {
        saveState(path, state);
        pruneOldState(dirname(sessionFile));
      }
      return post(url, session.token, plan);
    });
  }

  if (kind === "stop") {
    const last = typeof event.last_assistant_message === "string" ? event.last_assistant_message.trim() : "";
    const body = { harness };
    if (last) body.lastMessage = last.length > MAX_LAST_MESSAGE_CHARS ? `${last.slice(0, MAX_LAST_MESSAGE_CHARS - 1)}…` : last;
    return post(url, session.token, body);
  }

  const body = { harness };
  if (typeof event.source === "string") body.source = event.source;
  return post(url, session.token, body);
};

// The local smoke test imports this file for its helpers; everything else runs it.
if (process.env.GLEAP_HOOK_IMPORT_ONLY !== "1" && process.argv[2] === "mcp-headers") {
  // Claude Code needs a JSON object on stdout and exit 0, or it logs an error
  // (and connects without the header anyway).
  const argv = process.argv.slice(3);
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  let headers = {};
  try {
    headers = mcpHeadersFor({ project: arg("--project"), region: arg("--region") });
  } catch (err) {
    debug("mcp-headers:", String(err?.message ?? err));
  }
  process.stdout.write(`${JSON.stringify(headers)}\n`, () => process.exit(0));
} else if (process.env.GLEAP_HOOK_IMPORT_ONLY !== "1") {
  const kind = process.argv[2];
  const finish = () => {
    // Codex requires JSON on stdout for Stop; `{}` is a no-op for both harnesses.
    if (kind === "stop") process.stdout.write("{}\n");
    process.exit(0);
  };
  setTimeout(finish, HARD_EXIT_MS).unref();
  run()
    .catch((err) => debug("error:", String(err?.message ?? err)))
    .finally(finish);
}
