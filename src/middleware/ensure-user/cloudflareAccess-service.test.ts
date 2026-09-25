import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCloudflareAccessContext } from "./cloudflareAccess";

const mocks = vi.hoisted(() => ({
  env: {
    TEAM_DOMAIN: "https://team.cloudflareaccess.com",
    POLICY_AUD: "audience",
    MCP_SERVICE_TOKEN_CLIENT_ID: "ops-token.access",
    MCP_SERVICE_TOKEN_EMAIL: "ops-service@example.com",
  },
  jwtVerify: vi.fn(),
  resolveSharedWorkspaceContext: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: mocks.env }));
vi.mock("jose", () => ({
  createRemoteJWKSet: () => async () => ({}),
  jwtVerify: mocks.jwtVerify,
}));
vi.mock("./delegated", () => ({
  resolveSharedWorkspaceContext: mocks.resolveSharedWorkspaceContext,
}));

const headers = new Headers({ "cf-access-jwt-assertion": "signed-assertion" });

describe("Cloudflare Access MCP service identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSharedWorkspaceContext.mockImplementation(
      async (userId: string, userEmail: string) => ({
        userId,
        userEmail,
        organizationId: "shared-workspace",
        role: "owner",
        emailVerified: true,
      }),
    );
  });

  it("accepts the configured signed service identity only for the MCP path", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: { common_name: "ops-token.access", sub: "service-subject" },
    });
    await expect(resolveCloudflareAccessContext(headers)).rejects.toThrow();
    const context = await resolveCloudflareAccessContext(headers, {
      allowMcpServiceToken: true,
    });
    expect(context).toMatchObject({
      userId: "service:ops-token.access",
      userEmail: "ops-service@example.com",
      mcpServiceToken: true,
    });
  });

  it("rejects an unrelated service token even on MCP", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: { common_name: "other-token.access", sub: "service-subject" },
    });
    await expect(
      resolveCloudflareAccessContext(headers, { allowMcpServiceToken: true }),
    ).rejects.toThrow();
    expect(mocks.resolveSharedWorkspaceContext).not.toHaveBeenCalled();
  });

  it("keeps ordinary human Access identities unchanged", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: { sub: "human-1", email: "owner@example.com" },
    });
    const context = await resolveCloudflareAccessContext(headers, {
      allowMcpServiceToken: true,
    });
    expect(context).toMatchObject({
      userId: "human-1",
      userEmail: "owner@example.com",
    });
    expect(context.mcpServiceToken).toBeUndefined();
  });
});
