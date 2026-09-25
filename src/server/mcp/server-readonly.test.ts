import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { createWorkersOAuthMcpProps } from "@/server/mcp/context";
import { createOpenSeoMcpServer } from "@/server/mcp/server";

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn(), env: {} }));

async function listToolNames(readOnly: boolean) {
  const server = createOpenSeoMcpServer(
    createWorkersOAuthMcpProps({
      userId: "service:test",
      userEmail: "ops-service@example.com",
      organizationId: "shared-workspace",
      baseUrl: "https://seo.example.com",
      readOnly,
    }),
  );
  const client = new Client({ name: "ops-allowlist-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    return (await client.listTools()).tools.map((tool) => tool.name);
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

describe("MCP service-token tool boundary", () => {
  it("exposes only the dashboard's explicitly approved read tools", async () => {
    const names = await listToolNames(true);
    expect(names).toEqual([
      "whoami",
      "list_projects",
      "list_saved_keywords",
      "get_rank_tracker",
      "get_search_console_performance",
      "inspect_urls",
      "get_audit_status",
      "get_audit_issues",
      "get_audit_pages",
    ]);
  });

  it("does not narrow the human MCP tool set", async () => {
    const names = await listToolNames(false);
    expect(names).toContain("save_keywords");
    expect(names).toContain("run_site_audit");
  });
});
