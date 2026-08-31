import readline from "node:readline";

const turns = new Map();
let lastThreadOptions = null;
let lastTurnOptions = null;
const input = readline.createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

input.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialized") return;
  if (message.method === "initialize") {
    process.stdout.write("not-json\n");
    send({ id: message.id, result: { userAgent: "fake", codexHome: "/tmp", platformFamily: "unix", platformOs: "test" } });
    return;
  }
  if (message.method === "echo") {
    setTimeout(() => send({ id: message.id, result: message.params.value }), message.params.delay ?? 0);
    return;
  }
  if (message.method === "never") return;
  if (message.method === "crash") {
    process.exit(2);
  }
  if (message.method === "thread/start") {
    lastThreadOptions = message.params;
    send({ id: message.id, result: { thread: { id: "thread-1" } } });
    return;
  }
  if (message.method === "test/lastThreadOptions") {
    send({ id: message.id, result: lastThreadOptions });
    return;
  }
  if (message.method === "test/lastTurnOptions") {
    send({ id: message.id, result: lastTurnOptions });
    return;
  }
  if (message.method === "turn/start") {
    lastTurnOptions = message.params;
    const turnId = `turn-${message.id}`;
    turns.set(turnId, message.params.threadId);
    send({ id: message.id, result: { turn: { id: turnId } } });
    send({ method: "item/agentMessage/delta", params: { threadId: message.params.threadId, turnId, itemId: "item-1", delta: "hello" } });
    if (!message.params.input[0].text.includes("wait")) {
      send({ method: "item/agentMessage/delta", params: { threadId: message.params.threadId, turnId, itemId: "item-1", delta: " world" } });
      send({ method: "turn/completed", params: { threadId: message.params.threadId, turn: { id: turnId, status: "completed", error: null } } });
    }
    return;
  }
  if (message.method === "turn/interrupt") {
    send({ id: message.id, result: {} });
    send({ method: "turn/completed", params: { threadId: message.params.threadId, turn: { id: message.params.turnId, status: "interrupted", error: null } } });
    return;
  }
  send({ id: message.id, result: {} });
});
