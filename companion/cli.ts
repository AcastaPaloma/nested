#!/usr/bin/env node

import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { CodexAppServer } from "../lib/codex/app-server";
import type { CompanionJob, CompanionJobUpdate } from "../lib/companion/types";

const DEFAULT_URL = "https://nested-kuan-yis-projects.vercel.app";
const CONFIG_PATH = join(homedir(), ".config", "nested", "companion.json");

type Config = { token: string; url: string; workspace: string };

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArgument(name: string) {
  return process.argv.includes(name);
}

function readConfig(): Partial<Config> {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<Config>;
  } catch {
    return {};
  }
}

async function hiddenTokenPrompt() {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const readline = createInterface({ input: process.stdin, output, terminal: true });
  process.stdout.write("Paste the Nested pairing token (input is hidden): ");
  muted = true;
  const token = await readline.question("");
  muted = false;
  readline.close();
  process.stdout.write("\n");
  return token.trim();
}

async function loadConfig(): Promise<Config> {
  const saved = readConfig();
  const pair = hasArgument("--pair");
  const token = pair
    ? await hiddenTokenPrompt()
    : argument("--token") ?? process.env.NESTED_COMPANION_TOKEN ?? saved.token;
  const url = (argument("--url") ?? process.env.NESTED_URL ?? saved.url ?? DEFAULT_URL).replace(/\/$/, "");
  const workspace = resolve(
    argument("--workspace") ?? process.env.NESTED_WORKSPACE ?? saved.workspace ?? process.cwd()
  );
  if (!token?.startsWith("nested_companion_")) {
    throw new Error("Missing pairing token. Copy the companion command from Nested → Connect your Codex.");
  }
  if (!statSync(workspace).isDirectory()) {
    throw new Error(`Nested workspace is not a directory: ${workspace}`);
  }
  const config = { token, url, workspace };
  mkdirSync(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(CONFIG_PATH, 0o600);
  return config;
}

function serializableError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { message: String(error) };
}

class CompanionClient {
  constructor(
    private readonly config: Config,
    private readonly manager: CodexAppServer
  ) {}

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.config.url}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (response.status === 401) throw new Error("Pairing token was revoked. Pair this Mac again in Nested.");
    return response;
  }

  async heartbeat() {
    const status = await this.manager.getStatus();
    const response = await this.request("/api/companion/heartbeat", {
      method: "POST",
      body: JSON.stringify({ ...status, name: hostname() }),
    });
    if (!response.ok) throw new Error(`Heartbeat failed (${response.status}): ${await response.text()}`);
    return status;
  }

  async claim(): Promise<CompanionJob | null> {
    const response = await this.request("/api/companion/jobs/claim", { method: "POST", body: "{}" });
    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`Claim failed (${response.status}): ${await response.text()}`);
    return response.json() as Promise<CompanionJob>;
  }

  async update(jobId: string, update: CompanionJobUpdate) {
    const response = await this.request(`/api/companion/jobs/${jobId}`, {
      method: "POST",
      body: JSON.stringify(update),
    });
    if (!response.ok) throw new Error(`Job update failed (${response.status}): ${await response.text()}`);
  }

  async cancellation(jobId: string) {
    const response = await this.request(`/api/companion/jobs/${jobId}`);
    if (!response.ok) throw new Error(`Cancellation check failed (${response.status})`);
    return response.json() as Promise<{ cancelRequested: boolean }>;
  }
}

async function runJob(client: CompanionClient, manager: CodexAppServer, job: CompanionJob) {
  let threadId: string | undefined;
  let turnId: string | undefined;
  let outputText = "";
  let updateChain = Promise.resolve();
  let flushTimer: NodeJS.Timeout | undefined;
  let cancelTimer: NodeJS.Timeout | undefined;

  if (job.kind === "archive") {
    try {
      await manager.archiveThread(job.action.threadId);
      await client.update(job.id, { phase: "completed", threadId: job.action.threadId });
    } catch (error) {
      await client.update(job.id, {
        phase: "failed",
        threadId: job.action.threadId,
        error: serializableError(error),
      }).catch(() => undefined);
    }
    return;
  }

  const enqueue = (update: CompanionJobUpdate) => {
    updateChain = updateChain.then(() => client.update(job.id, update));
    return updateChain;
  };
  const flush = () => {
    flushTimer = undefined;
    return enqueue({ phase: "progress", outputText, threadId, turnId });
  };
  const scheduleFlush = () => {
    if (!flushTimer) flushTimer = setTimeout(() => void flush(), 250);
  };

  try {
    if (job.action.type === "fork") {
      threadId = await manager.forkThread(job.action.threadId, job.action.turnId, job.model);
    } else if (job.action.type === "resume") {
      threadId = await manager.resumeThread(job.action.threadId, job.model);
    } else {
      threadId = await manager.startThread(job.model);
    }

    const turn = await manager.streamTurn({
      threadId,
      text: job.prompt,
      model: job.model,
      clientUserMessageId: job.clientUserMessageId,
      onDelta(delta) {
        outputText += delta;
        scheduleFlush();
      },
      onItem({ phase, item }) {
        const type = typeof item.type === "string" ? item.type : "unknown";
        if (type !== "agentMessage" && type !== "reasoning") {
          const detail =
            type === "webSearch" && typeof item.query === "string"
              ? ` · ${item.query}`
              : type === "mcpToolCall" && typeof item.tool === "string"
                ? ` · ${String(item.server ?? "mcp")}.${item.tool}`
                : "";
          console.log(`[nested] tool ${type} ${phase}${detail}`);
        }
      },
    });
    turnId = turn.turnId;
    await enqueue({ phase: "started", outputText, threadId, turnId });
    cancelTimer = setInterval(() => {
      void client.cancellation(job.id).then(({ cancelRequested }) => {
        if (cancelRequested && threadId && turnId) void manager.interruptTurn(threadId, turnId);
      }).catch((error) => console.error("[nested] cancel check:", error instanceof Error ? error.message : error));
    }, 1_000);

    const completion = await turn.completion;
    if (flushTimer) clearTimeout(flushTimer);
    await updateChain;
    await enqueue({
      phase: completion.status,
      outputText,
      threadId,
      turnId,
      error: completion.error ?? undefined,
    });
  } catch (error) {
    if (flushTimer) clearTimeout(flushTimer);
    await updateChain.catch(() => undefined);
    await client.update(job.id, {
      phase: "failed",
      outputText,
      threadId,
      turnId,
      error: serializableError(error),
    }).catch(() => undefined);
    console.error(`[nested] job ${job.id} failed:`, error instanceof Error ? error.message : error);
  } finally {
    if (cancelTimer) clearInterval(cancelTimer);
  }
}

async function main() {
  const config = await loadConfig();
  const manager = new CodexAppServer({ workspaceDirectory: config.workspace });
  const client = new CompanionClient(config, manager);
  let stopped = false;
  let busy = false;
  let lastHeartbeat = 0;
  const stop = () => {
    stopped = true;
    manager.stop();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  const status = await client.heartbeat();
  lastHeartbeat = Date.now();
  if (!status.authenticated) throw new Error(status.error ?? "Codex CLI is not authenticated. Run `codex login` first.");
  console.log(`[nested] companion online at ${config.url}`);
  console.log(`[nested] Codex ${status.planType ?? status.accountType ?? "account"} · ${status.models.length} models`);
  console.log(`[nested] workspace ${config.workspace}`);
  console.log("[nested] harness live web search · workspace write · local tools · skills/plugins/MCP");

  while (!stopped) {
    try {
      if (Date.now() - lastHeartbeat >= 10_000) {
        await client.heartbeat();
        lastHeartbeat = Date.now();
      }
      if (!busy) {
        const job = await client.claim();
        if (job) {
          busy = true;
          console.log(job.kind === "turn"
            ? `[nested] running job ${job.id} with ${job.model}`
            : `[nested] archiving Codex thread ${job.action.threadId}`);
          await runJob(client, manager, job);
          busy = false;
        }
      }
    } catch (error) {
      console.error("[nested]", error instanceof Error ? error.message : error);
      if (error instanceof Error && error.message.includes("Pairing token was revoked")) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}

main().catch((error) => {
  console.error(`[nested] companion stopped: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
