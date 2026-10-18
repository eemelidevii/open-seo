import type { Client } from "@libsql/client";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { resolveSharedWorkspaceContext } from "./delegated";

const database = vi.hoisted(() => ({ client: null as Client | null }));

vi.mock("@/db", async () => {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  const schema = await import("@/db/better-auth-schema");
  database.client = createClient({ url: "file::memory:" });
  return { db: drizzle(database.client, { schema }) };
});
vi.mock("@/db/schema", async () => import("@/db/better-auth-schema"));
vi.mock("@/server/auth/delegated-organization", () => ({
  ensureSharedWorkspaceOrganization: async () => "shared-workspace",
  ensureDelegatedOrganizationForUser: vi.fn(),
}));

beforeAll(async () => {
  await database.client!.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE user (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0, image TEXT,
      created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0,
      analytics_opted_out INTEGER, last_active_organization_id TEXT
    );
    CREATE TABLE saved_grant (
      user_id TEXT NOT NULL REFERENCES user(id), token TEXT NOT NULL
    );
  `);
});

afterAll(() => database.client!.close());

it.each([
  [
    "Access account migration",
    "old-subject",
    "new-subject",
    "owner@example.com",
  ],
  [
    "MCP token rotation",
    "service:old.access",
    "service:new.access",
    "ops@example.com",
  ],
])(
  "preserves the user and grants after %s",
  async (_label, oldId, newId, email) => {
    await database.client!.execute({
      sql: "INSERT INTO user (id, name, email) VALUES (?, 'Owner', ?)",
      args: [oldId, email],
    });
    await database.client!.execute({
      sql: "INSERT INTO saved_grant (user_id, token) VALUES (?, 'encrypted-grant')",
      args: [oldId],
    });

    await expect(
      resolveSharedWorkspaceContext(newId, email),
    ).resolves.toMatchObject({
      userId: oldId,
      userEmail: email,
      organizationId: "shared-workspace",
    });
    const grants = await database.client!.execute({
      sql: "SELECT u.id, g.token FROM user u JOIN saved_grant g ON g.user_id = u.id WHERE u.email = ?",
      args: [email],
    });
    expect(grants.rows).toEqual([{ id: oldId, token: "encrypted-grant" }]);
    const users = await database.client!.execute({
      sql: "SELECT count(*) AS count FROM user WHERE email = ?",
      args: [email],
    });
    expect(users.rows[0].count).toBe(1);
  },
);

it("creates a separate user for a different verified email", async () => {
  await resolveSharedWorkspaceContext("existing-subject", "other@example.com");

  await expect(
    resolveSharedWorkspaceContext("new-subject", "teammate@example.com"),
  ).resolves.toMatchObject({
    userId: "new-subject",
    userEmail: "teammate@example.com",
  });
  const users = await database.client!.execute(
    "SELECT count(*) AS count FROM user WHERE email IN ('other@example.com', 'teammate@example.com')",
  );
  expect(users.rows[0].count).toBe(2);
});
