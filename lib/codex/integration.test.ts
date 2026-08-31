import assert from "node:assert/strict";
import test from "node:test";
import { CodexAppServer } from "./app-server";

test("local Codex ChatGPT integration", { skip: process.env.CODEX_INTEGRATION_TEST !== "1", timeout: 180_000 }, async () => {
  const manager = new CodexAppServer({ requestTimeoutMs: 30_000, workspaceDirectory: process.cwd() });
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
    const itemTypes = new Set<string>();
    const first = await manager.streamTurn({
      threadId,
      text: [
        "This is a tool-harness smoke test.",
        "You must use live web search once and use the shell once to run `printf NESTED_SHELL_OK`.",
        "Then reply briefly with the marker NESTED_SHELL_OK and one web fact you found.",
      ].join(" "),
      model,
      clientUserMessageId: crypto.randomUUID(), onDelta: (delta) => { output += delta; },
      onItem: ({ item }) => {
        if (typeof item.type === "string") itemTypes.add(item.type);
      },
    });
    assert.equal((await first.completion).status, "completed");
    assert.match(output, /NESTED_SHELL_OK/);
    assert.ok(itemTypes.has("commandExecution"), `Missing commandExecution item: ${[...itemTypes].join(", ")}`);
    assert.ok(itemTypes.has("webSearch"), `Missing webSearch item: ${[...itemTypes].join(", ")}`);

    const forkId = await manager.forkThread(threadId, first.turnId, model);
    threadIds.push(forkId);
    assert.notEqual(forkId, threadId);
  } finally {
    await Promise.allSettled(threadIds.map((threadId) => manager.archiveThread(threadId)));
    manager.stop();
  }
});
