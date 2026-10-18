import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";

it.each([
  "drizzle/sqlite/0055_chief_centennial.sql",
  "drizzle/pg/0033_lively_killer_shrike.sql",
])(
  "%s keeps historical audit details and nullable legacy writes",
  (migration) => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(
        "CREATE TABLE audits (id text PRIMARY KEY); INSERT INTO audits VALUES ('audit');",
      );
      const pageDdl = readFileSync(
        "drizzle/sqlite/0000_fantastic_vanisher.sql",
        "utf8",
      )
        .split("--> statement-breakpoint")
        .find((statement) => /^\s*CREATE TABLE `audit_pages`/.test(statement));
      if (!pageDdl) throw new Error("Production audit page DDL is missing");
      db.exec(pageDdl);
      const details = ["[1,2]", '[{"alt":"Saved image"}]', '[{"lang":"fi"}]'];
      db.prepare(
        "INSERT INTO audit_pages (id,audit_id,url,heading_order_json,images_json,hreflang_tags_json) VALUES ('old','audit','https://example.com',?,?,?)",
      ).run(...details);

      // Both fork migrations are intentionally SQL no-ops. Evaluating each
      // against a real legacy table catches an accidental upstream DROP restore.
      db.exec(readFileSync(migration, "utf8"));
      expect(
        db
          .prepare(
            "SELECT heading_order_json,images_json,hreflang_tags_json FROM audit_pages WHERE id='old'",
          )
          .get(),
      ).toEqual({
        heading_order_json: details[0],
        images_json: details[1],
        hreflang_tags_json: details[2],
      });
      db.exec(
        "INSERT INTO audit_pages (id,audit_id,url) VALUES ('new','audit','https://example.com/new')",
      );
      expect(
        db
          .prepare(
            "SELECT heading_order_json,images_json,hreflang_tags_json FROM audit_pages WHERE id='new'",
          )
          .get(),
      ).toEqual({
        heading_order_json: null,
        images_json: null,
        hreflang_tags_json: null,
      });
    } finally {
      db.close();
    }
  },
);
