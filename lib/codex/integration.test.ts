import assert from "node:assert/strict";
import test from "node:test";
import { CodexAppServer } from "./app-server";

test("local Codex ChatGPT integration", { skip: process.env.CODEX_INTEGRATION_TEST !== "1", timeout: 120_000 }, async () => {
  const manager = new CodexAppServer({ requestTimeoutMs: 30_000 });
  const threadIds: string[] = [];
  try {
    const status = await manager.getStatus();
    assert.equal(status.accountType, "chatgpt");
    assert.ok(status.planType);
    if (process.env.CODEX_EXPECTED_PLAN) {
      assert.equal(status.planType, process.env.CODEX_EXPECTED_PLAN);
    }
    assert.ok(status.models.length > 0);
    assert.equal(process.env.OPENAI_API_KEY, undefined);

    const model = status.models.find((entry) => entry.isDefault)?.model ?? status.models[0].model;
    const threadId = await manager.startThread(model);
    threadIds.push(threadId);
    let output = "";
    const first = await manager.streamTurn({
      threadId, text: "Reply with exactly: nested smoke test", model,
      clientUserMessageId: crypto.randomUUID(), onDelta: (delta) => { output += delta; },
    });
    assert.equal((await first.completion).status, "completed");
    assert.ok(output.length > 0);

    const forkId = await manager.forkThread(threadId, first.turnId, model);
    threadIds.push(forkId);
    assert.notEqual(forkId, threadId);
  } finally {
    await Promise.allSettled(threadIds.map((threadId) => manager.archiveThread(threadId)));
    manager.stop();
  }
});
