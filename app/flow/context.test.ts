import assert from "node:assert/strict";
import test from "node:test";
import { buildContextPlan } from "./context";
import type { MessageLike } from "./types";

const messages: MessageLike[] = [
  { id: "a1", parentId: null, role: "user", content: "Root A", createdAt: 1 },
  { id: "a2", parentId: "a1", role: "assistant", content: "First answer", createdAt: 2 },
  { id: "a3", parentId: "a1", role: "assistant", content: "Sibling answer", createdAt: 3 },
  { id: "b1", parentId: null, role: "user", content: "Root B", createdAt: 4 },
  { id: "b2", parentId: "b1", role: "assistant", content: "Pinned detail", createdAt: 5 },
  { id: "b3", parentId: "b1", role: "assistant", content: "Unrelated sibling", createdAt: 6 },
];

test("active context follows one exact root-to-leaf path", () => {
  const plan = buildContextPlan({
    messages,
    activeNodeId: "a3",
    pinnedNodeIds: [],
  });

  assert.deepEqual(plan.included.map(({ message }) => message.id), ["a1", "a3"]);
  assert.ok(!plan.included.some(({ message }) => message.id === "a2"));
});

test("a pin adds only the ancestry required for that node", () => {
  const plan = buildContextPlan({
    messages,
    activeNodeId: "a2",
    pinnedNodeIds: ["b2"],
  });

  const ids = plan.included.map(({ message }) => message.id);
  assert.deepEqual(ids, ["b1", "b2", "a1", "a2"]);
  assert.ok(!ids.includes("b3"));
});

test("a context link adds only its target ancestry", () => {
  const plan = buildContextPlan({
    messages,
    activeNodeId: "a2",
    pinnedNodeIds: [],
    linkedNodeIds: ["b2"],
  });

  assert.deepEqual(plan.included.map(({ message }) => message.id), ["b1", "b2", "a1", "a2"]);
  assert.ok(plan.included.filter(({ source }) => source === "link").length > 0);
  assert.ok(!plan.included.some(({ message }) => message.id === "b3"));
});

test("the budget keeps the newest active message before older context", () => {
  const plan = buildContextPlan({
    messages,
    activeNodeId: "a2",
    pinnedNodeIds: ["b2"],
    budget: 8,
  });

  assert.deepEqual(plan.included.map(({ message }) => message.id), ["a2"]);
  assert.ok(plan.omitted.length > 0);
});
