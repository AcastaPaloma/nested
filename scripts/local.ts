import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function commandWorks(command: string, args: string[]) {
  return spawnSync(command, args, { stdio: "ignore" }).status === 0;
}

async function portIsFree(port: number) {
  return new Promise<boolean>((resolveResult) => {
    const server = createServer();
    server.once("error", () => resolveResult(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolveResult(true)));
  });
}

async function choosePort(requested?: string) {
  if (requested) {
    const port = Number(requested);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid port: ${requested}`);
    if (!(await portIsFree(port))) throw new Error(`Port ${port} is already in use.`);
    return port;
  }
  for (let port = 3000; port <= 3010; port += 1) if (await portIsFree(port)) return port;
  throw new Error("No free port found between 3000 and 3010.");
}

function openBrowser(url: string) {
  if (process.argv.includes("--no-open")) return;
  if (process.platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  else if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

async function waitUntilReady(url: string) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch {
      // Next is still compiling.
    }
    await new Promise((resolveResult) => setTimeout(resolveResult, 350));
  }
  throw new Error("Nested did not become ready within 60 seconds.");
}

async function main() {
  if (!commandWorks("codex", ["--version"])) {
    throw new Error("Codex CLI is missing. Install it with: npm install -g @openai/codex");
  }
  if (!commandWorks("codex", ["login", "status"])) {
    throw new Error("Codex is not signed in. Run: codex login");
  }

  const workspace = resolve(argument("--workspace") ?? process.cwd());
  const port = await choosePort(argument("--port") ?? process.env.PORT);
  const url = `http://localhost:${port}/flow`;
  const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const localEnvironment = {
    ...process.env,
    NESTED_LOCAL_MODE: "1",
    NEXT_PUBLIC_NESTED_LOCAL_MODE: "1",
    NESTED_WORKSPACE: workspace,
  };
  const development = process.argv.includes("--dev");
  if (!development) {
    console.log("Building the local app…");
    const build = spawnSync(process.execPath, [nextBin, "build"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: localEnvironment,
    });
    if (build.status !== 0) throw new Error("The local production build failed.");
  }

  const child = spawn(process.execPath, [
    nextBin,
    development ? "dev" : "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: localEnvironment,
  });

  const stop = (signal: NodeJS.Signals) => {
    if (!child.killed) child.kill(signal);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  try {
    await waitUntilReady(url);
    console.log(`\nNested is ready at ${url}`);
    console.log(`Codex workspace: ${workspace}`);
    console.log("Conversation data: ~/.nested/data.json\n");
    openBrowser(url);
  } catch (error) {
    stop("SIGTERM");
    throw error;
  }

  await new Promise<void>((resolveResult, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0 || signal === "SIGINT" || signal === "SIGTERM") resolveResult();
      else reject(new Error(`Nested exited with ${signal ?? `code ${code}`}`));
    });
  });
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
