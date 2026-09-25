import * as Effect from "effect/Effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  application: {
    id: "app-id",
    type: "self_hosted",
    domain: "seo.example.workers.dev",
    name: "OpenSEO",
    policies: [{ id: "human-allow" }],
    oauthConfiguration: {
      enabled: true,
      dynamicClientRegistration: {
        enabled: true,
        allowedUris: ["https://ops.dmfaster.com/api/ops/seo/openseo/callback"],
      },
    } as {
      enabled: boolean;
      dynamicClientRegistration?: { enabled: boolean; allowedUris: string[] };
    } | null,
  },
  updates: [] as unknown[],
}));

vi.mock("@distilled.cloud/cloudflare/zero-trust", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@distilled.cloud/cloudflare/zero-trust")
    >();
  const Streams = await import("effect/Stream");
  return {
    ...original,
    listAccessApplicationsForAccount: {
      items: () =>
        Streams.fromIterable([
          {
            id: state.application.id,
            type: state.application.type,
            domain: state.application.domain,
          },
        ]),
    },
    getAccessApplicationForAccount: () => Effect.succeed(state.application),
    updateAccessApplicationForAccount: (input: {
      oauthConfiguration: typeof state.application.oauthConfiguration;
    }) => {
      state.updates.push(input);
      state.application.oauthConfiguration = input.oauthConfiguration;
      return Effect.succeed(state.application);
    },
  };
});

import {
  captureManagedOAuth,
  restoreManagedOAuth,
} from "../alchemy.access-managed-oauth";

// The mocked ZeroTrust functions satisfy the HTTP/Credentials requirements at
// runtime; their original signatures still carry those requirements in types.
const runMockedAccess = <A>(effect: Effect.Effect<A, never, unknown>) =>
  Effect.runPromise(effect as Effect.Effect<A, never, never>);

describe("Managed OAuth deployment reconciliation", () => {
  beforeEach(() => {
    state.application.policies = [{ id: "human-allow" }];
    state.application.oauthConfiguration = {
      enabled: true,
      dynamicClientRegistration: {
        enabled: true,
        allowedUris: ["https://ops.dmfaster.com/api/ops/seo/openseo/callback"],
      },
    };
    state.updates.length = 0;
  });

  it("restores OAuth after Alchemy updates the app and retains the newly declared service policy", async () => {
    const snapshot = await runMockedAccess(
      captureManagedOAuth("account-id", state.application.domain),
    );
    expect(snapshot?.oauth.enabled).toBe(true);
    state.application.oauthConfiguration = null;
    state.application.policies = [{ id: "ops-service" }, { id: "human-allow" }];

    await runMockedAccess(
      restoreManagedOAuth("account-id", state.application.domain, snapshot),
    );
    expect(state.updates).toHaveLength(1);
    expect(
      (state.application.oauthConfiguration as { enabled: boolean } | null)
        ?.enabled,
    ).toBe(true);
    expect(state.application.policies).toEqual([
      { id: "ops-service" },
      { id: "human-allow" },
    ]);
    await runMockedAccess(
      restoreManagedOAuth("account-id", state.application.domain, snapshot),
    );
    expect(state.updates).toHaveLength(1);
  });
});
