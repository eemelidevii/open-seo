# DM Faster self-host upgrade compatibility

The DM Faster fork preserves its Cloudflare account migration and internal Ops
integration while taking upstream releases. Deploy only the OpenSEO app stack;
the separate `web/` workspace does not deploy the DM Faster marketing site.

## Preserve historical audit columns

The fork retains the nullable `heading_order_json`, `images_json`, and
`hreflang_tags_json` columns in the v0.1.13 SQLite and Postgres upgrade
migrations. The new app no longer uses them, but keeping their saved values
preserves historical data and keeps the previous Worker compatible with a
code rollback. Removing these columns requires a separate data-retention
review. Do not replace the fork's migration files with upstream copies.

The database therefore intentionally contains these three extra nullable
columns beyond the current application model. New writes can omit them.
Rehearse all pending migrations against a verified backup and compare original
column values before applying them to the live installation.

## Keep Ops rank results complete

The read-only machine identity retains complete rank-tracker results when the
caller omits pagination, up to the configured 1,000-keyword tracker limit.
Human MCP clients use upstream's 100-row default, and explicit pagination takes
precedence for either identity. Only the verified Access service transport can
stamp the machine flag; callers cannot opt into it through tool arguments.

## Keep authentication stable

Preserve the Google client, encryption key, callback allowlist, connected user
IDs, and encrypted grants. The verified email lookup keeps the same user when
an Access account move changes its subject. Ordinary app routes still require
a human Access identity. Machine MCP access retains the exact nine-tool
read-only allowlist, including when upstream adds paid or mutating tools.

Use the self-host deployment wrapper to restore Managed OAuth after Alchemy
reconciliation. Preserve the dedicated Cloudflare profile and company-only
scheduler ownership. The old account stays idle as recovery evidence.

## Dependency security review

The v0.1.13 upgrade keeps the existing Better Auth, Alchemy and Effect pins.
Security floors update Seroval to at least 1.6.3, smol-toml to 1.9.0 and
source-map-js to 1.2.2. Their advisories are
[Seroval callable deserialization](https://github.com/lxsmnsyc/seroval/security/advisories/GHSA-p6vx-979v-rg4c),
[Seroval allocation bounds](https://github.com/lxsmnsyc/seroval/security/advisories/GHSA-jp82-f5mq-hwhp),
[TOML parsing](https://github.com/squirrelchat/smol-toml/security/advisories/GHSA-r4xh-jqrq-34v2),
and [source-map offsets](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

Direct MCP client imports are used only by in-memory contract tests, so that
dependency belongs in development dependencies. Both tests use patched 2.2.0;
the unused direct v1 SDK dependency is removed. Agents still declares these
clients as peers, so overrides also pin its client to 2.2.0, its legacy SDK to
1.31.0 and the legacy Express proxy-addr dependency to at least 2.0.8.
The production v2 server remains pinned, and the
[client OAuth advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6qxp-vccf-f47h)
does not apply to servers. There is no HTTP OAuth client or saved client grant
in these tests.

[sprintf-js has no patched release](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).
It remains in Think's installed dependency tree through just-bash, but SAM
disables `workspaceBash`, and the bundler replaces just-bash with a stub.
The Worker build rejects both real packages in every output chunk, including
lazy chunks. The audit exception applies only while this exclusion holds for
both app and audit Workers. Reassess it before enabling bash or changing the
alias or bundle guard.
