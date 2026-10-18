import { beforeEach, expect, it, vi } from "vitest";
import type { z } from "zod";
import {
  exportAuditLighthouseIssues,
  getAuditLighthouseIssues,
} from "./lighthouse";

const { getLighthouseResultById, getJsonFromR2 } = vi.hoisted(() => ({
  getLighthouseResultById: vi.fn(),
  getJsonFromR2: vi.fn(),
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: { getLighthouseResultById },
}));
vi.mock("@/server/lib/r2", () => ({ getJsonFromR2 }));
vi.mock("@/serverFunctions/middleware", () => ({ requireProjectContext: [] }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: (schema: z.ZodType) => ({
        handler:
          (
            handler: (input: {
              data: unknown;
              context: { projectId: string };
            }) => unknown,
          ) =>
          ({ data }: { data: unknown }) =>
            handler({
              data: schema.parse(data),
              context: { projectId: "authorized-project" },
            }),
      }),
    }),
  }),
}));

const data = { projectId: "authorized-project", resultId: "historical-result" };
const savedScores = {
  performance: 63,
  accessibility: 91,
  "best-practices": 100,
  seo: 92,
};

beforeEach(() => {
  getLighthouseResultById.mockResolvedValue({
    lighthouse: {
      id: data.resultId,
      strategy: "mobile",
      r2Key: "historical-payload.json",
      performanceScore: savedScores.performance,
      accessibilityScore: savedScores.accessibility,
      bestPracticesScore: savedScores["best-practices"],
      seoScore: savedScores.seo,
    },
    page: { url: "https://example.com/docs" },
    audit: { startedAt: "2026-10-01T12:00:00.000Z" },
  });
  getJsonFromR2.mockResolvedValue(null);
});

it("preserves historical scores and identifies an unavailable detail file", async () => {
  await expect(getAuditLighthouseIssues({ data })).resolves.toMatchObject({
    id: data.resultId,
    finalUrl: "https://example.com/docs",
    payloadAvailable: false,
    hasIssueDetails: false,
    scores: savedScores,
    metrics: null,
    issues: [],
  });
});

it("refuses to export a fabricated empty report when the saved payload is absent", async () => {
  await expect(
    exportAuditLighthouseIssues({ data: { ...data, mode: "issues" } }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("keeps available legacy payloads readable and exports their original bytes", async () => {
  const original = '{"legacy":true}';
  getJsonFromR2.mockResolvedValue(original);
  await expect(getAuditLighthouseIssues({ data })).resolves.toMatchObject({
    payloadAvailable: true,
    hasIssueDetails: false,
    scores: savedScores,
  });
  await expect(
    exportAuditLighthouseIssues({ data: { ...data, mode: "full" } }),
  ).resolves.toMatchObject({ content: original });
});

it("does not label a storage service failure as missing historical data", async () => {
  getJsonFromR2.mockRejectedValue(new Error("Storage unavailable"));
  await expect(getAuditLighthouseIssues({ data })).rejects.toThrow(
    "Storage unavailable",
  );
});

it("does not read storage for a result outside the authorized project", async () => {
  getLighthouseResultById.mockResolvedValue(null);
  await expect(getAuditLighthouseIssues({ data })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(getJsonFromR2).not.toHaveBeenCalled();
});
