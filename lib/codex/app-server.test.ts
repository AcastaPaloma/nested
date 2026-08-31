import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CodexAppServer } from "./app-server";

const fixture = fileURLToPath(new URL("./fixtures/fake-app-server.mjs", import.meta.url));
const workspaceDirectory = "/tmp/nested-test-workspace";
const createManager = (options: { timeout?: number; restart?: number } = {}) =>
  new CodexAppServer({
    childFactory: () => spawn(process.execPath, [fixture], { stdio: ["pipe", "pipe", "pipe"] }),
    requestTimeoutMs: options.timeout ?? 1_000,
    restartDelayMs: options.restart ?? 20,
    workspaceDirectory,
  });

test("starts threads with the complete local Codex tool harness", async () => {
  const manager = createManager();
  await manager.startThread("fake-model");
  const options = await manager.request<Record<string, unknown>>("test/lastThreadOptions");
  assert.equal(options.cwd, workspaceDirectory);
  assert.deepEqual(options.runtimeWorkspaceRoots, [workspaceDirectory]);
  assert.equal(options.sandbox, "workspace-write");
  assert.equal(options.approvalPolicy, "on-request");
  assert.equal(options.approvalsReviewer, "auto_review");
  assert.deepEqual(options.config, {
    web_search: "live",
    tools: { web_search: true, view_image: true },
    features: { shell_tool: true, unified_exec: true },
    sandbox_workspace_write: { network_access: true },
  });
  assert.match(String(options.developerInstructions), /Use the available local, web, skill, plugin, and MCP tools/);
  assert.equal("environments" in options, false);
  manager.stop();
});

test("correlates out-of-order JSON-RPC responses and ignores malformed lines", async () => {
  const manager = createManager();
  let malformed = 0;
  manager.on("malformed", () => malformed++);
  await manager.ensureStarted();
  const [slow, fast] = await Promise.all([
    manager.request<string>("echo", { value: "slow", delay: 30 }),
    manager.request<string>("echo", { value: "fast", delay: 0 }),
  ]);
  assert.equal(slow, "slow");
  assert.equal(fast, "fast");
  assert.equal(malformed, 1);
  manager.stop();
});

test("streams agent deltas through turn completion", async () => {
  const manager = createManager();
  const deltas: string[] = [];
  const result = await manager.streamTurn({
    threadId: "thread-1",
    text: "respond",
    model: "fake-model",
    clientUserMessageId: "message-1",
    onDelta: (delta) => deltas.push(delta),
  });
  assert.deepEqual(await result.completion, { status: "completed", error: null });
  assert.equal(deltas.join(""), "hello world");
  const options = await manager.request<Record<string, unknown>>("test/lastTurnOptions");
  assert.equal(options.approvalPolicy, "on-request");
  assert.equal(options.approvalsReviewer, "auto_review");
  assert.equal(options.cwd, workspaceDirectory);
  assert.deepEqual(options.collaborationMode, {
    mode: "default",
    settings: {
      model: "fake-model",
      developer_instructions: options.collaborationMode &&
        typeof options.collaborationMode === "object" &&
        "settings" in options.collaborationMode
          ? (options.collaborationMode.settings as { developer_instructions: string }).developer_instructions
          : null,
    },
  });
  assert.match(
    String((options.collaborationMode as { settings: { developer_instructions: string } }).settings.developer_instructions),
    /Use the available local, web, skill, plugin, and MCP tools/
  );
  assert.deepEqual(options.sandboxPolicy, {
    type: "workspaceWrite",
    writableRoots: [workspaceDirectory],
    networkAccess: true,
  });
  manager.stop();
});

test("interrupts an active turn and reports interrupted completion", async () => {
  const manager = createManager();
  const result = await manager.streamTurn({
    threadId: "thread-1",
    text: "wait",
    model: "fake-model",
    clientUserMessageId: "message-1",
    onDelta: () => undefined,
  });
  await manager.interruptTurn("thread-1", result.turnId);
  assert.equal((await result.completion).status, "interrupted");
  manager.stop();
});

test("times out unanswered requests", async () => {
  const manager = createManager({ timeout: 30 });
  await assert.rejects(manager.request("never"), /timed out/);
  manager.stop();
});

test("restarts after an app-server crash", async () => {
  const manager = createManager({ restart: 10 });
  await assert.rejects(manager.request("crash"), /exited/);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(await manager.request<string>("echo", { value: "restarted" }), "restarted");
  manager.stop();
});
