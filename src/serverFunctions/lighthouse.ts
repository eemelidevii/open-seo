import { createServerFn } from "@tanstack/react-start";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import {
  buildLighthouseExportFile,
  readStoredLighthousePayload,
} from "@/server/lib/lighthousePayload";
import { AppError } from "@/server/lib/errors";
import { getJsonFromR2 } from "@/server/lib/r2";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  lighthouseAuditExportSchema,
  lighthouseAuditIssueSchema,
} from "@/types/schemas/lighthouse";

async function getAuditLighthouseData(input: {
  projectId: string;
  resultId: string;
}) {
  const site = await AuditRepository.getLighthouseResultById({
    lighthouseResultId: input.resultId,
    projectId: input.projectId,
  });

  if (!site) {
    throw new AppError("NOT_FOUND");
  }

  const r2Key = site.lighthouse.r2Key;
  const payloadJson = r2Key ? await getJsonFromR2(r2Key) : null;
  const payload =
    payloadJson === null ? null : readStoredLighthousePayload(payloadJson);

  return {
    id: site.lighthouse.id,
    strategy: site.lighthouse.strategy,
    finalUrl: site.page?.url ?? "",
    createdAt: site.audit.startedAt,
    payloadJson,
    payload,
    savedScores: {
      performance: site.lighthouse.performanceScore,
      accessibility: site.lighthouse.accessibilityScore,
      "best-practices": site.lighthouse.bestPracticesScore,
      seo: site.lighthouse.seoScore,
    },
  };
}

export const getAuditLighthouseIssues = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(lighthouseAuditIssueSchema)
  .handler(async ({ data, context }) => {
    const lighthouse = await getAuditLighthouseData({
      projectId: context.projectId,
      resultId: data.resultId,
    });

    return {
      id: lighthouse.id,
      finalUrl:
        lighthouse.payload?.storedPayload?.metadata.finalUrl ??
        lighthouse.finalUrl,
      strategy: lighthouse.strategy,
      createdAt: lighthouse.createdAt,
      payloadAvailable: lighthouse.payloadJson !== null,
      hasIssueDetails: lighthouse.payload?.report.hasIssueDetails ?? false,
      scores:
        lighthouse.payload?.storedPayload?.scores ?? lighthouse.savedScores,
      metrics: lighthouse.payload?.storedPayload?.metrics ?? null,
      issues: lighthouse.payload?.report.issues ?? [],
    };
  });

export const exportAuditLighthouseIssues = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(lighthouseAuditExportSchema)
  .handler(async ({ data, context }) => {
    const lighthouse = await getAuditLighthouseData({
      projectId: context.projectId,
      resultId: data.resultId,
    });

    if (lighthouse.payloadJson === null) {
      throw new AppError("NOT_FOUND");
    }

    return buildLighthouseExportFile({
      idField: "resultId",
      idValue: lighthouse.id,
      finalUrl: lighthouse.finalUrl,
      strategy: lighthouse.strategy,
      createdAt: lighthouse.createdAt,
      payloadJson: lighthouse.payloadJson,
      mode: data.mode,
      category: data.mode === "category" ? data.category : undefined,
    });
  });
