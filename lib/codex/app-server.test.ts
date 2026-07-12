import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CodexAppServer } from "./app-server";

const fixture = fileURLToPath(new URL("./fixtures/fake-app-server.mjs", import.meta.url));
const createManager = (options: { timeout?: number; restart?: number } = {}) =>
  new CodexAppServer({
    childFactory: () => spawn(process.execPath, [fixture], { stdio: ["pipe", "pipe", "pipe"] }),
    requestTimeoutMs: options.timeout ?? 1_000,
    restartDelayMs: options.restart ?? 20,
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

