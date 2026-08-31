# Contributing to Nested

Thanks for helping make spatial conversations better.

## Before opening an issue

- Search existing issues first.
- Include the browser, operating system, Node.js version, and Codex CLI version for bugs.
- Remove credentials, access tokens, conversation content, and other private data from logs and screenshots.
- Use GitHub&apos;s private security reporting flow for vulnerabilities instead of a public issue.

## Local development

1. Fork and clone the repository.
2. Run `npm install`.
3. Follow the local Supabase and Codex setup in `README.md`.
4. Create a focused branch from `main`.
5. Make the change and add tests when behavior changes.
6. Run:

```bash
npm run lint
npm test
npm run build
```

## Pull requests

- Keep each pull request focused on one coherent improvement.
- Explain the user impact and include screenshots for visual changes.
- Call out schema changes and include an ordered Supabase migration.
- Do not commit `.env.local`, Codex credentials, Supabase secret keys, or generated build output.
- Keep the public API and README accurate when setup or behavior changes.

Maintainers may ask for changes before merging. Be kind, specific, and patient in review.
