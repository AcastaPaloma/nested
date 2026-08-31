import assert from "node:assert/strict";
import test from "node:test";
import { buildReferencedContext } from "./prompt";
import { chooseThreadAction, threadsToArchive } from "./runs";

test("starts a thread for a new root", () => {
  assert.deepEqual(chooseThreadAction({
    run_id: "run", parent_run_id: null, parent_thread_id: null, parent_turn_id: null, should_fork: false,
  }), { type: "start" });
});

test("resumes a parent's thread while it is still the tip", () => {
  assert.deepEqual(chooseThreadAction({
    run_id: "run", parent_run_id: "parent", parent_thread_id: "thread", parent_turn_id: "turn", should_fork: false,
  }), { type: "resume", threadId: "thread" });
});

test("forks at the parent turn for a sibling or retry branch", () => {
  assert.deepEqual(chooseThreadAction({
    run_id: "run", parent_run_id: "parent", parent_thread_id: "thread", parent_turn_id: "turn", should_fork: true,
  }), { type: "fork", threadId: "thread", turnId: "turn" });
});

test("adds only referenced ancestry to the hidden context block", () => {
  const context = buildReferencedContext([
    { id: "root", parent_id: null, role: "user", content: "root text" },
    { id: "a", parent_id: "root", role: "assistant", content: "selected path" },
    { id: "sibling", parent_id: "root", role: "assistant", content: "must be absent" },
  ], ["a"]);
  assert.match(context, /root text/);
  assert.match(context, /selected path/);
  assert.doesNotMatch(context, /must be absent/);
  assert.match(context, /background context only/);
});

test("conversation deletion archives each associated thread once", () => {
  assert.deepEqual(threadsToArchive([
    { thread_id: "thread-a" },
    { thread_id: "thread-a" },
    { thread_id: "thread-b" },
    { thread_id: null },
  ]), ["thread-a", "thread-b"]);
});
