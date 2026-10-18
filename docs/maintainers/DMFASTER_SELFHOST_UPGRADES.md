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
