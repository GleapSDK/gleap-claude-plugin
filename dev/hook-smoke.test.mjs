// Local smoke test for scripts/gleap-hook.mjs: runs the real script with
// sample hook payloads against a tiny local HTTP server.
//
//   node --test dev/
//
// Covers what the hook must guarantee: the right route and body per event,
// the Bearer token only to a Gleap (or explicitly allowed local) host, and
// silence + exit 0 when there is no session file, the token expired, or the
// server is down or hangs.
import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "gleap-hook.mjs");
const TOKEN = "test-hook-token-DO-NOT-PRINT";

let server;
let port;
let requests = [];
let mode = "ok"; // ok | hang

before(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
      if (mode === "hang") return; // never answer
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});

after(() => {
  server.closeAllConnections?.();
  server.close();
});

beforeEach(() => {
  requests = [];
  mode = "ok";
});

const makeRepo = (session) => {
  const repo = mkdtempSync(join(tmpdir(), "gleap-hook-"));
  mkdirSync(join(repo, ".git"));
  mkdirSync(join(repo, "src", "deep"), { recursive: true });
  if (session !== null) {
    mkdirSync(join(repo, ".gleap"));
    writeFileSync(
      join(repo, ".gleap", "session.json"),
      JSON.stringify({
        sessionId: "65f0c0ffee0000000000abcd",
        token: TOKEN,
        apiBase: `http://127.0.0.1:${port}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        ...session,
      }),
    );
  }
  return repo;
};

const runHook = (args, payload, env = {}) =>
  new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, GLEAP_HOOK_ALLOW_LOCAL: "1", ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr, ms: Date.now() - started }));
    child.stdin.end(typeof payload === "string" ? payload : JSON.stringify(payload));
  });

const common = (cwd, extra) => ({ session_id: "harness-session-1", cwd, transcript_path: "/tmp/t.jsonl", ...extra });

describe("gleap-hook", () => {
  test("TodoWrite → POST /v3/kai-agent-hooks/plan with the whole list", async () => {
    const repo = makeRepo({});
    const r = await runHook(
      ["plan", "--harness", "claude-code"],
      common(join(repo, "src", "deep"), {
        hook_event_name: "PostToolUse",
        tool_name: "TodoWrite",
        tool_input: {
          todos: [
            { content: "Reproduce the 403", status: "completed", activeForm: "Reproducing" },
            { content: "Fix the region check", status: "in_progress", activeForm: "Fixing" },
            { content: "Open the PR", status: "pending", activeForm: "Opening" },
          ],
        },
        tool_response: {},
      }),
    );
    assert.equal(r.code, 0);
    assert.equal(r.stdout, "");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/v3/kai-agent-hooks/plan");
    assert.equal(requests[0].auth, `Bearer ${TOKEN}`);
    assert.deepEqual(requests[0].body, {
      items: [
        { content: "Reproduce the 403", status: "completed" },
        { content: "Fix the region check", status: "in_progress" },
        { content: "Open the PR", status: "pending" },
      ],
    });
    rmSync(repo, { recursive: true, force: true });
  });

  test("security: a group/world-readable session.json is tightened to 0600 before use", { skip: process.platform === "win32" }, async () => {
    const repo = makeRepo({});
    const file = join(repo, ".gleap", "session.json");
    chmodSync(file, 0o644);
    const r = await runHook(["stop", "--harness", "claude-code"], common(repo, { hook_event_name: "Stop", last_assistant_message: "Done." }));
    assert.equal(r.code, 0);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(requests.length, 1);
    rmSync(repo, { recursive: true, force: true });
  });

  test("TaskCreate + TaskUpdate rebuild the full list from per-session state", async () => {
    const repo = makeRepo({});
    const ev = (tool_name, tool_input, tool_response = {}) =>
      common(repo, { hook_event_name: "PostToolUse", tool_name, tool_input, tool_response });
    await runHook(["plan"], ev("TaskCreate", { subject: "Read the ticket", description: "…" }, { task: { id: "1", subject: "Read the ticket" } }));
    await runHook(["plan"], ev("TaskCreate", { subject: "Write the fix" }, { task: { id: "2", subject: "Write the fix" } }));
    await runHook(["plan"], ev("TaskCreate", { subject: "Scratch step" }, { task: { id: "3", subject: "Scratch step" } }));
    await runHook(["plan"], ev("TaskUpdate", { taskId: "1", status: "completed" }));
    await runHook(["plan"], ev("TaskUpdate", { id: "2", status: "in_progress" })); // non-canonical key
    await runHook(["plan"], ev("TaskUpdate", { taskId: "3", status: "deleted" }));
    assert.equal(requests.length, 6);
    assert.deepEqual(requests.at(-1).body, {
      items: [
        { content: "Read the ticket", status: "completed" },
        { content: "Write the fix", status: "in_progress" },
      ],
    });
    // A different harness session starts from an empty list.
    await runHook(["plan"], { ...ev("TaskCreate", { subject: "Other session" }, { task: { id: "1" } }), session_id: "harness-session-2" });
    assert.deepEqual(requests.at(-1).body, { items: [{ content: "Other session", status: "pending" }] });
    rmSync(repo, { recursive: true, force: true });
  });

  test("parallel TaskCreate hooks don't lose tasks; the last request has the full list", async () => {
    const repo = makeRepo({});
    const ev = (id) =>
      common(repo, { hook_event_name: "PostToolUse", tool_name: "TaskCreate", tool_input: { subject: `Task ${id}` }, tool_response: { task: { id } } });
    await Promise.all(["1", "2", "3", "4"].map((id) => runHook(["plan"], ev(id))));
    assert.equal(requests.length, 4);
    assert.equal(requests.at(-1).body.items.length, 4);
    rmSync(repo, { recursive: true, force: true });
  });

  test("Codex update_plan maps step/status and keeps the explanation", async () => {
    const repo = makeRepo({});
    await runHook(
      ["plan", "--harness", "codex"],
      common(repo, {
        hook_event_name: "PostToolUse",
        turn_id: "turn-1",
        tool_name: "update_plan",
        tool_input: {
          explanation: "Found the root cause",
          plan: [
            { step: "Find the root cause", status: "completed" },
            { step: "Patch it", status: "inProgress" },
            { step: "Old idea", status: "canceled" },
          ],
        },
      }),
    );
    assert.deepEqual(requests[0].body, {
      items: [
        { content: "Find the root cause", status: "completed" },
        { content: "Patch it", status: "in_progress" },
        { content: "Old idea", status: "cancelled" },
      ],
      explanation: "Found the root cause",
    });
    rmSync(repo, { recursive: true, force: true });
  });

  test("the Gleap MCP update_plan tool is not re-posted (it reached Gleap itself)", async () => {
    const repo = makeRepo({});
    const r = await runHook(
      ["plan"],
      common(repo, { hook_event_name: "PostToolUse", tool_name: "mcp__plugin_gleap_gleap__update_plan", tool_input: { items: [] } }),
    );
    assert.equal(r.code, 0);
    assert.equal(requests.length, 0);
    rmSync(repo, { recursive: true, force: true });
  });

  test("Stop → POST /stop with the trimmed last message; stdout is `{}`", async () => {
    const repo = makeRepo({});
    const long = `  ${"x".repeat(5000)}  `;
    const r = await runHook(["stop", "--harness", "claude-code"], common(repo, { hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: long }));
    assert.equal(r.code, 0);
    assert.equal(r.stdout.trim(), "{}");
    assert.equal(requests[0].url, "/v3/kai-agent-hooks/stop");
    assert.equal(requests[0].body.harness, "claude-code");
    assert.equal(requests[0].body.lastMessage.length, 4000);
    rmSync(repo, { recursive: true, force: true });
  });

  test("SessionStart → POST /session-start (liveness only)", async () => {
    const repo = makeRepo({});
    await runHook(["session-start", "--harness", "codex"], common(repo, { hook_event_name: "SessionStart", source: "resume" }));
    assert.deepEqual(requests[0], {
      method: "POST",
      url: "/v3/kai-agent-hooks/session-start",
      auth: `Bearer ${TOKEN}`,
      body: { harness: "codex", source: "resume" },
    });
    rmSync(repo, { recursive: true, force: true });
  });

  test("apiBase with a trailing /v3 or slash still hits /v3/kai-agent-hooks/*", async () => {
    const repo = makeRepo({ apiBase: `http://127.0.0.1:${port}/v3/` });
    await runHook(["session-start"], common(repo, { hook_event_name: "SessionStart", source: "startup" }));
    assert.equal(requests[0].url, "/v3/kai-agent-hooks/session-start");
    rmSync(repo, { recursive: true, force: true });
  });

  test("no .gleap/session.json → silent, exit 0, no request (also stops at the repo root)", async () => {
    const parent = makeRepo({}); // a session file ABOVE the repo must not be used
    const repo = join(parent, "nested-repo");
    mkdirSync(join(repo, ".git"), { recursive: true });
    for (const [kind, payload] of [
      ["plan", { tool_name: "TodoWrite", tool_input: { todos: [{ content: "a", status: "pending" }] } }],
      ["stop", { last_assistant_message: "done" }],
      ["session-start", { source: "startup" }],
    ]) {
      const r = await runHook([kind], common(repo, payload));
      assert.equal(r.code, 0);
      assert.equal(r.stderr, "");
      assert.equal(r.stdout.trim(), kind === "stop" ? "{}" : "");
    }
    assert.equal(requests.length, 0);
    rmSync(parent, { recursive: true, force: true });
  });

  test("expired token, non-Gleap host, or local host without opt-in → no request", async () => {
    const expired = makeRepo({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    const foreign = makeRepo({ apiBase: "https://gleap.ai.evil.example" });
    const local = makeRepo({});
    await runHook(["stop"], common(expired, { last_assistant_message: "hi" }));
    await runHook(["stop"], common(foreign, { last_assistant_message: "hi" }));
    await runHook(["stop"], common(local, { last_assistant_message: "hi" }), { GLEAP_HOOK_ALLOW_LOCAL: "" });
    assert.equal(requests.length, 0);
    for (const d of [expired, foreign, local]) rmSync(d, { recursive: true, force: true });
  });

  test("Gleap API hosts on both domains are allowed; look-alikes are not", async () => {
    process.env.GLEAP_HOOK_IMPORT_ONLY = "1";
    const { isAllowedApiBase } = await import(pathToFileURL(script).href);
    delete process.env.GLEAP_HOOK_IMPORT_ONLY;
    // The EU session file carries https://dashapi.gleap.io, the US one https://dashapi.us.gleap.ai.
    for (const base of ["https://dashapi.gleap.io", "https://dashapi.us.gleap.ai", "https://api.gleap.io/v3"]) {
      assert.equal(isAllowedApiBase(base, {}), true, base);
    }
    for (const base of ["https://gleap.ai.evil.example", "https://evilgleap.io", "http://dashapi.gleap.io"]) {
      assert.equal(isAllowedApiBase(base, {}), false, base);
    }
  });

  test("server down → exit 0 fast; server hangs → exit 0 after the 2 s request timeout", async () => {
    const down = makeRepo({ apiBase: "http://127.0.0.1:9" });
    const r1 = await runHook(["stop"], common(down, { last_assistant_message: "hi" }));
    assert.equal(r1.code, 0);
    assert.equal(r1.stdout.trim(), "{}");
    assert.ok(r1.ms < 3000, `took ${r1.ms} ms`);

    mode = "hang";
    const hang = makeRepo({});
    const r2 = await runHook(["plan"], common(hang, { tool_name: "TodoWrite", tool_input: { todos: [{ content: "a", status: "pending" }] } }));
    assert.equal(r2.code, 0);
    assert.ok(r2.ms >= 1900 && r2.ms < 3400, `took ${r2.ms} ms`);

    // A second hook waiting on the lock gives up after 1 s and still gets its
    // POST out before the 3.5 s hard exit.
    requests = [];
    const [a, b] = await Promise.all(
      ["x", "y"].map((c) => runHook(["plan"], common(hang, { tool_name: "TodoWrite", tool_input: { todos: [{ content: c, status: "pending" }] } }))),
    );
    for (const r of [a, b]) {
      assert.equal(r.code, 0);
      assert.ok(r.ms < 3800, `took ${r.ms} ms`);
    }
    assert.equal(requests.length, 2);
    for (const d of [down, hang]) rmSync(d, { recursive: true, force: true });
  });

  test("garbage on stdin or an unknown event → exit 0, nothing posted, token never printed", async () => {
    const repo = makeRepo({});
    const r1 = await runHook(["plan"], "not json");
    const r2 = await runHook(["unknown-event"], common(repo, {}));
    const r3 = await runHook(["stop"], common(repo, { last_assistant_message: "ok" }), { GLEAP_HOOK_DEBUG: "1" });
    for (const r of [r1, r2, r3]) {
      assert.equal(r.code, 0);
      assert.ok(!r.stdout.includes(TOKEN) && !r.stderr.includes(TOKEN));
    }
    assert.equal(requests.length, 1); // only the valid stop
    rmSync(repo, { recursive: true, force: true });
  });
});
