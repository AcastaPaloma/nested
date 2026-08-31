# Nested

[![GitHub stars](https://img.shields.io/github/stars/AcastaPaloma/nested?style=flat-square&logo=github)](https://www.star-history.com/#AcastaPaloma/nested&Date)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

Nested is a spatial chat client for Codex. A conversation becomes a board: continue from any agent response, branch an idea without losing the original path, collapse subtrees, and open long responses in a focused reader.

The recommended local app talks directly to the [Codex app server](https://developers.openai.com/codex/app-server), saves boards on your computer, and reuses your Codex CLI login. The hosted deployment remains available: it uses Supabase for accounts and boards plus a secure production-to-Mac companion queue. Neither mode reads or copies your ChatGPT credentials.

## What you need

- Node.js 20 or newer
- npm
- A ChatGPT account with access to Codex
- The [Codex CLI](https://developers.openai.com/codex/cli)
- Supabase only if you are developing or self-hosting the multi-user deployment

No OpenAI Platform API key is required when you connect an eligible ChatGPT account. Usage-based API-key login is also supported.

## Download and run

```bash
git clone https://github.com/AcastaPaloma/nested.git
cd nested
npm install
```

Install Codex if it is not already available, then sign in with your ChatGPT account:

```bash
npm install -g @openai/codex
codex login
codex login status
```

Launch the local production app:

```bash
npm run local
```

Nested builds, chooses an available port, binds only to your computer's loopback interface, starts Codex directly, and opens your browser. It needs no Supabase project, Docker, account form, pairing token, or background companion. Boards, links, and node positions are saved atomically in `~/.nested/data.json` with owner-only file permissions.

By default, Codex can work in the Nested checkout. Point it at another project without moving or reinstalling Nested:

```bash
npm run local -- --workspace /absolute/path/to/your/project
```

Use `npm run local:dev` while changing Nested itself. Add `--no-open` to either command when you do not want the launcher to open a browser.

## Hosted deployment and companion

The Vercel/Supabase deployment remains supported. In hosted mode, open Nested, choose **Connect your Codex**, create a pairing command, and run that command from this project directory. The companion starts `codex app-server` and stays attached while you use Nested.

### Connect your own Codex

Every Nested account pairs with the Codex session on that user&apos;s computer. Nested does not proxy a shared maintainer account and never asks users to paste ChatGPT credentials into the browser.

- ChatGPT account: run `codex login` and finish the browser flow.
- Headless computer: run `codex login --device-auth`.
- OpenAI API account: run `printenv OPENAI_API_KEY | codex login --with-api-key`.

After signing in, choose **Connect your Codex** in Nested, create the one-time pairing command, and run it from the Nested checkout:

```bash
npm run companion -- --pair --url https://your-nested-app.example
```

The directory where you run this command becomes the Codex workspace. To choose it explicitly, add `--workspace /absolute/path/to/project`. The companion saves that path and gives Codex workspace-scoped read/write access there. Re-run the command with `--workspace` to switch projects.

Copy the raw pairing token from the dialog and paste it at the command&apos;s hidden prompt. It is shown once and saved to `~/.config/nested/companion.json` with owner-only permissions; it never enters shell history or process arguments. Production stores only its SHA-256 hash. The Mac makes outbound HTTPS requests—no local port is opened. Credentials remain in Codex&apos;s local credential store; only account status, available models, usage information, prompts, and streamed responses pass through the paired queue.

After the first successful pairing, install the companion as a per-user macOS background service so it starts automatically and restarts if it exits:

```bash
npm run companion:install
```

Its logs are written to `~/Library/Logs/Nested/`. Re-running the install command safely refreshes the service definition after updating Nested.

The companion uses Codex's full local harness: live web search, shell and file tools, image viewing, installed skills and plugins, and the MCP servers already configured in `~/.codex/config.toml`. Commands and edits run on the paired computer in Codex's `workspace-write` sandbox, with outbound network access and Codex's automatic approval reviewer. Vercel never executes local tools and does not receive your Codex credentials.

### Option A: local Supabase for hosted-mode development

Docker must be running.

```bash
npx supabase start
cp .env.example .env.local
```

`supabase start` prints the local API URL and publishable/anon key. Copy those values into `.env.local` if they differ from the example, then start Nested:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create a Nested account, and start a board. Local confirmation emails appear in Mailpit at [http://127.0.0.1:54324](http://127.0.0.1:54324).

### Option B: hosted Supabase

1. Create a Supabase project.
2. Install the Supabase CLI, or use it through `npx`.
3. Link this checkout and apply the included migrations:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

4. In Supabase Authentication settings, add `http://localhost:3000/auth/confirm` as a redirect URL for local development.
5. Copy `.env.example` to `.env.local`. Set the project URL, publishable key, and the server-only service-role key shown in the Supabase project settings. Never expose the service-role key through a `NEXT_PUBLIC_` variable.
6. Run `npm run dev`.

Do not put a Supabase secret/service-role key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`; any `NEXT_PUBLIC_` value is sent to the browser.

## Using the board

- Select **Continue from here** on an agent node to make the next message its child.
- Select **New root** to start a separate thought on the same board.
- Use the branch icon to hide or reveal all descendants. Its badge shows how many messages are hidden.
- Use the expand icon or **Full response** to read a message in the full-size reader.
- Drag or resize nodes to arrange the board. Node geometry is saved to Supabase.
- Pan freely in both directions with a mouse wheel or trackpad. Use **Overview** or the minimap to recover the whole board; the viewport and last-opened conversation are restored after logout on the same browser.
- Drag a node’s bottom connector onto another node’s top connector to create a teal **context** link. Continuing from the source node includes only the linked target’s ancestry in the next Codex turn. Select a teal link and press Delete/Backspace to remove it.
- Pin a node or type `@A3` to include its precise ancestry in the next response. The Context panel previews exactly what will be sent, including deliberate context links.
- Use **Find** (`Cmd/Ctrl+K`) to search every board by title or message text and jump straight back to a thought.

Keyboard details: `Enter` sends, `Shift+Enter` inserts a line break, `@` opens node references, `Cmd/Ctrl+K` opens Find, `Cmd/Ctrl+0` shows the whole board, the mouse wheel or trackpad pans in both directions, and `Ctrl/Cmd+wheel` zooms.

## Ollama

The Ollama server adapter and dependency remain in the repository for future/local development, but the product UI has no preconfigured Ollama connection or model. Codex is the only connected provider. The adapter refuses requests unless a developer explicitly sets `OLLAMA_HOST` and supplies a model; it contains no default endpoint or model.

## Development

```bash
npm run lint
npm test
npm run build
```

To reset the local database and replay every migration:

```bash
npx supabase db reset
```

The real Codex integration test is opt-in because it starts a short turn and fork against your local Codex session:

```bash
env -u OPENAI_API_KEY CODEX_INTEGRATION_TEST=1 npx tsx --test lib/codex/integration.test.ts
```

## Architecture

- Next.js App Router and React 19
- React Flow for the spatial canvas
- Local Codex companion and app-server for model discovery, account status, streaming turns, branching, cancellation, and rate-limit information
- Supabase Auth, Postgres, RLS, and Realtime for user-owned boards and companion jobs
- Ollama retained as an unconnected adapter only

The working context is bounded to roughly 12,000 estimated tokens. The active root-to-leaf path is automatic; pins, `@` references, and intentional context links add only the ancestry required for the chosen node, never an entire sibling tree.

## Star history

[![Nested GitHub stars](https://img.shields.io/github/stars/AcastaPaloma/nested?style=for-the-badge&logo=github&label=Nested%20stars)](https://www.star-history.com/#AcastaPaloma/nested&Date)

Click the badge to open Nested in [Star History](https://www.star-history.com/#AcastaPaloma/nested&Date). The graph will populate as the repository collects stars. ⭐

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Please report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

Nested is available under the [MIT License](LICENSE).
