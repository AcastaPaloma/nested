# Nested

[![GitHub stars](https://img.shields.io/github/stars/AcastaPaloma/nested?style=flat-square&logo=github)](https://www.star-history.com/#AcastaPaloma/nested&Date)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

Nested is a spatial chat client for Codex. A conversation becomes a board: continue from any agent response, branch an idea without losing the original path, collapse subtrees, and open long responses in a focused reader.

Generation runs through the local [Codex app server](https://developers.openai.com/codex/app-server). Nested reuses your Codex CLI login and never reads or copies your ChatGPT credentials. Supabase provides sign-in and per-user conversation storage.

## What you need

- Node.js 20 or newer
- npm
- A ChatGPT account with access to Codex
- The [Codex CLI](https://developers.openai.com/codex/cli)
- Either Docker for a local Supabase stack or a hosted [Supabase](https://supabase.com) project

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

Nested starts `codex app-server` itself when the first response is requested. You do not need to run a second Codex process.

### Connect your own Codex

Every Nested installation uses the Codex session on that user&apos;s computer. Nested does not proxy a shared maintainer account and never asks users to paste credentials into the browser.

- ChatGPT account: run `codex login` and finish the browser flow.
- Headless computer: run `codex login --device-auth`.
- OpenAI API account: run `printenv OPENAI_API_KEY | codex login --with-api-key`.

After signing in, choose **Connect your Codex** in Nested and refresh. Credentials remain in Codex&apos;s local credential store; only account status, available models, and usage information are shown in the UI.

### Option A: local Supabase

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
5. Copy `.env.example` to `.env.local` and replace both values with the project URL and publishable key shown in the Supabase project settings.
6. Run `npm run dev`.

Do not put a Supabase secret/service-role key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`; any `NEXT_PUBLIC_` value is sent to the browser.

## Using the board

- Select **Continue from here** on an agent node to make the next message its child.
- Select **New root** to start a separate thought on the same board.
- Use the branch icon to hide or reveal all descendants. Its badge shows how many messages are hidden.
- Use the expand icon or **Full response** to read a message in the full-size reader.
- Drag or resize nodes to arrange the board. Node geometry is saved to Supabase.
- Pan and zoom normally. The viewport and last-opened conversation are restored after logout on the same browser.
- Pin a node or type `@A3` to include its precise ancestry in the next response. The Context panel previews exactly what will be sent.

Keyboard details: `Enter` sends, `Shift+Enter` inserts a line break, `@` opens node references, the mouse wheel pans vertically, `Shift+wheel` pans horizontally, and `Ctrl/Cmd+wheel` zooms.

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
- Local Codex app-server for model discovery, account status, streaming turns, branching, cancellation, and rate-limit information
- Supabase Auth, Postgres, RLS, and Realtime for user-owned boards
- Ollama retained as an unconnected adapter only

The working context is bounded to roughly 12,000 estimated tokens. The active root-to-leaf path is automatic; pins and `@` references add only the ancestry required for the chosen node, never an entire sibling tree.

## Star history

[![Nested GitHub stars](https://img.shields.io/github/stars/AcastaPaloma/nested?style=for-the-badge&logo=github&label=Nested%20stars)](https://www.star-history.com/#AcastaPaloma/nested&Date)

Click the badge to open Nested in [Star History](https://www.star-history.com/#AcastaPaloma/nested&Date). The graph will populate as the repository collects stars. ⭐

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Please report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

Nested is available under the [MIT License](LICENSE).
