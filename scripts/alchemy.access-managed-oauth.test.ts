import { describe, expect, it } from "vitest";
import {
  assertServiceTokenHasRotationWindow,
  buildManagedOAuthUpdate,
  isManagedOAuthPreserved,
  omitNullAccessFields,
} from "../alchemy.access-managed-oauth";

describe("Managed OAuth Access preservation", () => {
  it("requires a service token with enough time to rotate it safely", () => {
    const now = Date.parse("2026-09-25T00:00:00.000Z");
    expect(() =>
      assertServiceTokenHasRotationWindow("2026-12-25T00:00:00.000Z", now),
    ).not.toThrow();
    expect(() =>
      assertServiceTokenHasRotationWindow("2026-10-01T00:00:00.000Z", now),
    ).toThrow("at least 30 days");
    expect(() => assertServiceTokenHasRotationWindow(null, now)).toThrow(
      "at least 30 days",
    );
  });

  it("round-trips the existing app's policy and identity settings with OAuth restored", () => {
    const update = buildManagedOAuthUpdate(
      {
        id: "app-id",
        domain: "seo.example.workers.dev",
        type: "self_hosted",
        name: "OpenSEO self-host",
        policies: [{ id: "human-allow" }, { id: "ops-service" }],
        allowedIdps: ["idp-1"],
        sessionDuration: "24h",
        allowIframe: null,
        oauthConfiguration: null,
      },
      "account-id",
      "app-id",
      {
        enabled: true,
        dynamicClientRegistration: {
          enabled: true,
          allowedUris: [
            "https://ops.dmfaster.com/api/ops/seo/openseo/callback",
          ],
          allowAnyOnLoopback: true,
        },
      },
    );
    expect(update.policies).toEqual([
      { id: "human-allow" },
      { id: "ops-service" },
    ]);
    expect(update.allowedIdps).toEqual(["idp-1"]);
    expect(update.oauthConfiguration?.enabled).toBe(true);
    expect("allowIframe" in update).toBe(false);
  });

  it("does not silently construct a PUT for a malformed Access app", () => {
    expect(() =>
      buildManagedOAuthUpdate({}, "account-id", "app-id", { enabled: true }),
    ).toThrow("cannot be safely round-tripped");
    expect(
      omitNullAccessFields({ a: null, nested: { b: 1, c: null } }),
    ).toEqual({
      nested: { b: 1 },
    });
  });

  it("checks retained OAuth grants and redirect allowlists without rejecting server defaults", () => {
    const expected = {
      enabled: true,
      dynamicClientRegistration: {
        enabled: true,
        allowedUris: ["https://ops.dmfaster.com/api/ops/seo/openseo/callback"],
      },
      grant: { sessionDuration: "30d" },
    };
    expect(isManagedOAuthPreserved(expected, null)).toBe(false);
    expect(
      isManagedOAuthPreserved(expected, {
        ...expected,
        dynamicClientRegistration: {
          ...expected.dynamicClientRegistration,
          allowedUris: [
            ...expected.dynamicClientRegistration.allowedUris,
            "http://127.0.0.1:9000/callback",
          ],
        },
        grant: { ...expected.grant, accessTokenLifetime: "24h" },
      }),
    ).toBe(true);
    expect(
      isManagedOAuthPreserved(expected, {
        enabled: true,
        dynamicClientRegistration: { enabled: false, allowedUris: [] },
      }),
    ).toBe(false);
  });
});
