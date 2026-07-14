# Security policy

## Supported versions

Nested is currently pre-1.0. Security fixes are applied to the latest commit on `main`.

## Reporting a vulnerability

Please use GitHub&apos;s **Report a vulnerability** feature in the Security tab of this repository. Do not open a public issue for authentication bypasses, RLS problems, credential exposure, dependency compromise, or other exploitable findings.

Include reproduction steps, affected routes or commits, expected impact, and any suggested mitigation. Remove real credentials and private conversation data from the report.

We aim to acknowledge a report within seven days. Please allow maintainers reasonable time to investigate and publish a fix before disclosing it publicly.

## Credential model

Nested uses the local Codex CLI credential store and public Supabase browser credentials. Never commit Codex auth files, OpenAI API keys, Supabase secret/service-role keys, or `.env.local`.
