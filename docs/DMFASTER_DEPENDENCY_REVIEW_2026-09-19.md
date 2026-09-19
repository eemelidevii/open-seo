# Self-host dependency review — 2026-09-19

## Release and scope

Updated the DM Faster OpenSEO installation from v0.1.8 to upstream stable
v0.1.9 (84e4705). Preserve the local Cloudflare Access email-OTP integration.
This does not change the DM Faster application repository or deployments.

## Dependency policy

Updated compatible dependency ranges and their lockfile, including React 19.3,
Tailwind 4.3, TanStack, AI SDK 6, PostHog, Wrangler and security fixes in
transitive dependencies. Upgraded Vitest to patched 4.1.11. Retained the existing
eight-day release-age policy; latest published does not automatically mean
compatible or ready for this installation.

Deliberate compatibility holds:

- Better Auth and API-key plugin: 1.6.22, with explicitly aligned core, utils,
  fetch and better-call peers. A broad update selected incompatible auth peers
  and broke type-checking. Do not independently update these packages.
- Recharts: 3.7.0. Newer tooltip types require a separate source migration.
- Oxlint / oxlint-tsgolint: 1.50.0 / 0.15.0. The newer linter removed a configured
  rule and introduced extensive new diagnostics; migrate the rules separately
  rather than suppressing them during a release.
- Effect / Alchemy: upstream exact prerelease stack. Pin platform-node-shared
  and effect/vitest to beta.93 as well: unconstrained transitive upgrades
  selected RC.114 and broke the deployment CLI with a missing ByteSize module.
- Vite 7, TypeScript 5, AI SDK 6, Drizzle 0.45 and agents/think remain on the
  upstream-compatible major/stack. Their newest major versions need coordinated
  application changes, not an untested package bump.

Remaining upstream peer warnings involve Vite 8 requirements in optional build
integrations, Alchemy's Drizzle RC requirements, and workers-ai-provider's AI 7
peer. Build, tests and Alchemy dry-run pass, but these warnings are not declared
resolved. In particular, the optional AI chat/provider path needs its own runtime
certification before claiming the entire dependency graph is optimal.

## Verification

- Baseline and final: 164 test files, 1,365 passing tests.
- TypeScript check: passed.
- Lint: zero warnings/errors on 910 files with the compatible linter.
- Selfhost production build: passed.
- Dependency audit: initial 34 findings (12 high, 17 moderate, 5 low);
  final zero unignored findings. One moderate advisory remains explicitly
  ignored by the pre-existing upstream policy: GHSA-67mh-4wv8-2f99 in the
  development-only Drizzle esbuild loader, whose serve mode is not invoked.
- D1 backup exported before mutation; restrict it to owner read/write and do
  not commit the backup or any environment/credential files.
- Deployment dry-run: DB and two workers updated; eight resources unchanged,
  including Access policy, OTP provider, OAuth KV, storage and workflows.

The v0.1.9 reports migration is additive. No rank-repair scripts were run and
this upgrade does not establish whether search traffic or rankings increased.

## Live verification

Deployment completed successfully to the existing selfhost URL. A read-only
remote ledger query confirmed `0047_reports.sql` applied. Authenticated MCP
`list_projects` returned the same three projects and `get_rank_tracker` returned
the existing 71-keyword DM Faster tracker and its saved September 19 results.
An unauthenticated health request remained protected (invalid_token), as
expected; no Access bypass was introduced. Frozen-lockfile offline install
also passed after deployment.
