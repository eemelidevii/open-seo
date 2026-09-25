import * as ZeroTrust from "@distilled.cloud/cloudflare/zero-trust";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { z } from "zod";

type ManagedOAuth = NonNullable<
  ZeroTrust.UpdateAccessApplicationForAccountRequest["oauthConfiguration"]
>;

export type ManagedOAuthSnapshot = {
  appId: string;
  oauth: ManagedOAuth;
};

const SERVICE_TOKEN_ROTATION_MARGIN_MS = 30 * 24 * 60 * 60 * 1000;

export function assertServiceTokenHasRotationWindow(
  expiresAt: string | null | undefined,
  now = Date.now(),
) {
  const expiry = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (
    !Number.isFinite(expiry) ||
    expiry <= now + SERVICE_TOKEN_ROTATION_MARGIN_MS
  ) {
    throw new Error(
      "The MCP service token must remain valid for at least 30 days after deployment.",
    );
  }
}

const oauthResponseSchema = z.object({
  enabled: z.boolean().nullable().optional(),
  dynamicClientRegistration: z
    .object({
      allowAnyOnLocalhost: z.boolean().nullable().optional(),
      allowAnyOnLoopback: z.boolean().nullable().optional(),
      allowedUris: z.array(z.string()).nullable().optional(),
      enabled: z.boolean().nullable().optional(),
    })
    .nullable()
    .optional(),
  grant: z
    .object({
      accessTokenLifetime: z.string().nullable().optional(),
      sessionDuration: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const validateMcpServiceToken = (
  accountId: string,
  serviceTokenId: string,
  clientId: string,
  email: string,
) =>
  Effect.gen(function* () {
    if (
      [serviceTokenId, clientId, email].some(Boolean) &&
      ![serviceTokenId, clientId, email].every(Boolean)
    ) {
      return yield* Effect.die(
        new Error(
          "Set MCP_SERVICE_TOKEN_ID, MCP_SERVICE_TOKEN_CLIENT_ID, and MCP_SERVICE_TOKEN_EMAIL together.",
        ),
      );
    }
    if (!serviceTokenId || !clientId) return;
    const token = yield* ZeroTrust.getAccessServiceTokenForAccount({
      accountId,
      serviceTokenId,
    }).pipe(Effect.orDie);
    if (token.clientId !== clientId) {
      return yield* Effect.die(
        new Error(
          "The selected service-token ID does not match MCP_SERVICE_TOKEN_CLIENT_ID.",
        ),
      );
    }
    assertServiceTokenHasRotationWindow(token.expiresAt);
  });

// Access GET allows null where PUT requires the property to be omitted. Keep
// every non-null property so an OAuth repair cannot erase unrelated settings.
export function omitNullAccessFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitNullAccessFields);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, field]) => field !== null && field !== undefined)
        .map(([key, field]) => [key, omitNullAccessFields(field)]),
    );
  }
  return value;
}

function normalizeOAuth(value: unknown): ManagedOAuth | null {
  const parsed = oauthResponseSchema.safeParse(value);
  if (!parsed.success || parsed.data.enabled !== true) return null;
  const source = parsed.data;
  return {
    enabled: true,
    ...(source.dynamicClientRegistration
      ? {
          dynamicClientRegistration: {
            allowAnyOnLocalhost:
              source.dynamicClientRegistration.allowAnyOnLocalhost ?? undefined,
            allowAnyOnLoopback:
              source.dynamicClientRegistration.allowAnyOnLoopback ?? undefined,
            allowedUris:
              source.dynamicClientRegistration.allowedUris ?? undefined,
            enabled: source.dynamicClientRegistration.enabled ?? undefined,
          },
        }
      : {}),
    ...(source.grant
      ? {
          grant: {
            accessTokenLifetime: source.grant.accessTokenLifetime ?? undefined,
            sessionDuration: source.grant.sessionDuration ?? undefined,
          },
        }
      : {}),
  };
}

export function isManagedOAuthPreserved(
  expected: ManagedOAuth,
  observed: ManagedOAuth | null,
) {
  if (!observed?.enabled) return false;
  const expectedDcr = expected.dynamicClientRegistration;
  const observedDcr = observed.dynamicClientRegistration;
  if (expectedDcr) {
    if (!observedDcr) return false;
    for (const key of [
      "enabled",
      "allowAnyOnLocalhost",
      "allowAnyOnLoopback",
    ] as const) {
      if (
        expectedDcr[key] !== undefined &&
        Boolean(observedDcr[key]) !== Boolean(expectedDcr[key])
      )
        return false;
    }
    if (
      expectedDcr.allowedUris?.some(
        (uri) => !observedDcr.allowedUris?.includes(uri),
      )
    )
      return false;
  }
  const expectedGrant = expected.grant;
  if (expectedGrant) {
    if (
      expectedGrant.accessTokenLifetime !== undefined &&
      observed.grant?.accessTokenLifetime !== expectedGrant.accessTokenLifetime
    )
      return false;
    if (
      expectedGrant.sessionDuration !== undefined &&
      observed.grant?.sessionDuration !== expectedGrant.sessionDuration
    )
      return false;
  }
  return true;
}

export function buildManagedOAuthUpdate(
  current: unknown,
  accountId: string,
  appId: string,
  oauth: ManagedOAuth,
): ZeroTrust.UpdateAccessApplicationForAccountRequest {
  if (
    !current ||
    typeof current !== "object" ||
    !("type" in current) ||
    current.type !== "self_hosted" ||
    !("domain" in current) ||
    typeof current.domain !== "string" ||
    !current.domain
  ) {
    throw new Error(
      "Access application cannot be safely round-tripped for OAuth preservation.",
    );
  }
  const candidate = omitNullAccessFields({
    ...current,
    accountId,
    appId,
    oauthConfiguration: oauth,
  });
  if (
    !Schema.is(ZeroTrust.UpdateAccessApplicationForAccountRequest)(candidate)
  ) {
    throw new Error(
      "Access application cannot be safely round-tripped for OAuth preservation.",
    );
  }
  return candidate;
}

export const captureManagedOAuth = (accountId: string, domain: string) =>
  Effect.gen(function* () {
    const applications = yield* ZeroTrust.listAccessApplicationsForAccount
      .items({ accountId })
      .pipe(Stream.runCollect, Effect.orDie);
    const app = Array.from(applications).find(
      (item) =>
        "domain" in item &&
        item.domain === domain &&
        item.type === "self_hosted",
    );
    if (!app?.id) return null;
    const detail = yield* ZeroTrust.getAccessApplicationForAccount({
      accountId,
      appId: app.id,
    }).pipe(Effect.orDie);
    const oauth = normalizeOAuth(
      "oauthConfiguration" in detail ? detail.oauthConfiguration : null,
    );
    if (!oauth) return null;
    // Validate the complete PUT body before Alchemy can modify this app.
    buildManagedOAuthUpdate(detail, accountId, app.id, oauth);
    return { appId: app.id, oauth } satisfies ManagedOAuthSnapshot;
  });

export const restoreManagedOAuth = (
  accountId: string,
  domain: string,
  snapshot: ManagedOAuthSnapshot | null,
) =>
  Effect.gen(function* () {
    if (!snapshot) return;
    const current = yield* ZeroTrust.getAccessApplicationForAccount({
      accountId,
      appId: snapshot.appId,
    }).pipe(Effect.orDie);
    if (
      current.type !== "self_hosted" ||
      !("domain" in current) ||
      current.domain !== domain
    ) {
      return yield* Effect.die(
        new Error("Access application identity changed during deploy."),
      );
    }
    const observed = normalizeOAuth(
      "oauthConfiguration" in current ? current.oauthConfiguration : null,
    );
    if (isManagedOAuthPreserved(snapshot.oauth, observed)) return;
    const update = buildManagedOAuthUpdate(
      current,
      accountId,
      snapshot.appId,
      snapshot.oauth,
    );
    yield* ZeroTrust.updateAccessApplicationForAccount(update).pipe(
      Effect.orDie,
    );
    const verified = yield* ZeroTrust.getAccessApplicationForAccount({
      accountId,
      appId: snapshot.appId,
    }).pipe(Effect.orDie);
    const restored = normalizeOAuth(
      "oauthConfiguration" in verified ? verified.oauthConfiguration : null,
    );
    if (!isManagedOAuthPreserved(snapshot.oauth, restored)) {
      return yield* Effect.die(
        new Error("Managed OAuth was not preserved after deploy."),
      );
    }
  });
