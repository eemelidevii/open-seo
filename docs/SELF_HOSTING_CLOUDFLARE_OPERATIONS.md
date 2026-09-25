# Cloudflare Self-Hosting: Operations

Day-to-day tasks after [initial setup](./SELF_HOSTING_CLOUDFLARE.md): connect the MCP server and manage telemetry. Updating and teammate access are covered in the [deploy guide](./SELF_HOSTING_CLOUDFLARE.md) (or the [legacy page](./SELF_HOSTING_CLOUDFLARE_LEGACY.md) for pre-alchemy deployments).

## Connect the MCP server through Cloudflare Access

Use the same Cloudflare Access application that protects your OpenSEO Worker.
Managed OAuth is required for MCP clients and is not enabled by default.

1. Open Cloudflare Zero Trust.
2. Go to `Access controls` -> `Applications`.
3. Find your OpenSEO application, then select `Edit`.
4. Go to `Additional settings` -> `OAuth`.
5. Turn on `Managed OAuth`.
6. In `Managed OAuth settings`, allow the redirect URIs your MCP clients use:
   - Allow `localhost` / loopback clients for CLI and desktop agents (Codex
     CLI, Claude Code) that register `http://localhost:PORT/callback`.
   - Add HTTPS redirect URIs for web connectors (a path may end in `/*`).
   - Without this, clients can't finish [Dynamic Client Registration](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)
     and log in but expose no tools.
7. Save.

MCP clients should connect to:

```text
https://YOUR_WORKER_HOSTNAME/mcp
```

### Optional read-only machine access for an internal dashboard

An unattended dashboard can authenticate to `/mcp` with a Cloudflare Access
service token instead of a user OAuth grant. Set `MCP_SERVICE_TOKEN_ID` to the
Cloudflare token UUID, `MCP_SERVICE_TOKEN_CLIENT_ID` to its Client ID, and
`MCP_SERVICE_TOKEN_EMAIL` to a dedicated service email that is not an existing
human user. For an Alchemy-managed Access application, the stack validates the
ID/Client ID match, requires at least 30 days before token expiry, and declares a
**Service Auth** policy for that token. If
the Access application is managed outside this stack, create the same narrowly
scoped policy there. The calling dashboard keeps
the Client ID and Client Secret server-side and sends them as
`CF-Access-Client-Id` and `CF-Access-Client-Secret` headers. Never put the
Client Secret in the OpenSEO environment or frontend.

The Worker checks the signed Access JWT `common_name`, not the caller-supplied
headers, and accepts this identity only for MCP. It exposes `whoami`, project
listing, Search Console performance, saved keywords, rank tracker reads, site
audit reads, and URL Inspection. Mutation and paid research tools are not
registered for this identity. Ordinary app routes still reject service JWTs.
Keep the token expiry and rotation in an operator-owned runbook; service
credentials are durable only while both the token and Access policy remain
valid.

OpenSEO's upstream Alchemy application resource omits Managed OAuth from its
PUT body. This fork captures the full live OAuth configuration before Access
reconciliation, validates that it can be round-tripped, restores it afterward
if needed, and verifies the redirect/grant settings. This guard is locally
tested, not production-certified. Before deploying over an existing app,
review the exact Access application, policy and redirect allowlist; perform a
staged deploy and live OAuth smoke test. Never rely on an unchecked routine
deploy to preserve Managed OAuth.

## Telemetry

OpenSEO collects anonymized telemetry for core usage events: heartbeats with aggregate counts (installs, users, projects, feature usage) tied to a random install ID, sent every 5 minutes during the first two hours after install, then at most once daily. No URLs, keywords, prompts, emails, or IP-derived location are collected, and idle installs send nothing.

To disable it, set `OPENSEO_TELEMETRY_DISABLED=1` in `.env.selfhost` and redeploy. Docker and [legacy deployments](./SELF_HOSTING_CLOUDFLARE_LEGACY.md): set it (or `DO_NOT_TRACK=1`) as an environment variable / Worker variable instead.
