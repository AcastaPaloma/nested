#!/usr/bin/env node

import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const LABEL = "com.nested.codex-companion";

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function runLaunchctl(args: string[], allowFailure = false) {
  const result = spawnSync("launchctl", args, { encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    throw new Error(result.stderr.trim() || `launchctl ${args[0]} failed`);
  }
}

const projectDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const require = createRequire(import.meta.url);
const tsxCli = require.resolve("tsx/cli");
const companionCli = join(projectDirectory, "companion", "cli.ts");
const launchAgentsDirectory = join(homedir(), "Library", "LaunchAgents");
const logsDirectory = join(homedir(), "Library", "Logs", "Nested");
const plistPath = join(launchAgentsDirectory, `${LABEL}.plist`);
const domain = `gui/${process.getuid?.() ?? (() => { throw new Error("Unable to resolve the macOS user id"); })()}`;
const companionPath = process.env.PATH ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";

mkdirSync(launchAgentsDirectory, { recursive: true, mode: 0o700 });
mkdirSync(logsDirectory, { recursive: true, mode: 0o700 });

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(tsxCli)}</string>
    <string>${xml(companionCli)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(projectDirectory)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xml(companionPath)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${xml(join(logsDirectory, "companion.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(join(logsDirectory, "companion.error.log"))}</string>
</dict>
</plist>
`;

writeFileSync(plistPath, plist, { mode: 0o600 });
chmodSync(plistPath, 0o600);
runLaunchctl(["bootout", domain, plistPath], true);
runLaunchctl(["bootstrap", domain, plistPath]);
runLaunchctl(["kickstart", "-k", `${domain}/${LABEL}`]);

console.log(`[nested] installed ${LABEL}`);
console.log(`[nested] logs: ${logsDirectory}`);
