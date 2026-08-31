import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("hosted snapshots merge idempotently while preserving graph relationships", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "nested-local-store-test-"));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  process.env.NESTED_DATA_DIR = directory;
  globalThis.__nestedLocalStoreQueue = undefined;
  const { localStore } = await import("./store");
  const now = new Date().toISOString();
  const snapshot = {
    conversations: [{ id: "conversation", user_id: "hosted-user", name: "Imported", created_at: now, updated_at: now }],
    messages: [
      { id: "user", conversation_id: "conversation", parent_id: null, role: "user" as const, content: "Question", model: null, provider: null, created_at: now },
      { id: "assistant", conversation_id: "conversation", parent_id: "user", role: "assistant" as const, content: "Answer", model: "codex", provider: "codex", created_at: now },
    ],
    references: [{ source_message_id: "user", target_message_id: "assistant" }],
    links: [{ source_message_id: "assistant", target_message_id: "user" }],
    positions: [{ conversation_id: "conversation", message_id: "assistant", x: 10, y: 20, width: 320 }],
    runs: [{
      id: "run", message_id: "assistant", conversation_id: "conversation", thread_id: "thread", turn_id: "turn",
      parent_run_id: null, model: "codex", status: "completed" as const, error_details: null, created_at: now, updated_at: now,
    }],
  };

  const first = await localStore.importSnapshot(snapshot);
  const second = await localStore.importSnapshot(snapshot);
  assert.deepEqual(first.added, { conversations: 1, messages: 2, references: 1, links: 1, positions: 1, runs: 1 });
  assert.deepEqual(second.added, { conversations: 0, messages: 0, references: 0, links: 0, positions: 0, runs: 0 });
  assert.deepEqual(second.totals, { conversations: 1, messages: 2, references: 1, links: 1, positions: 1, runs: 1 });
  assert.equal((await localStore.getConversation("conversation"))?.user_id, "local");
  assert.deepEqual(await localStore.getPositions("conversation"), { assistant: { x: 10, y: 20, width: 320 } });
});
