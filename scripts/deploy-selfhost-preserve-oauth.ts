import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import * as Credentials from "@distilled.cloud/cloudflare/Credentials";
import * as Workers from "@distilled.cloud/cloudflare/workers";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { workerName } from "../alchemy.access.ts";
import {
  captureManagedOAuth,
  restoreManagedOAuth,
} from "../alchemy.access-managed-oauth.ts";

const arguments_ = process.argv.slice(2);
const option = (name: string) =>
  arguments_
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
const allowed = arguments_.every(
  (value) =>
    value === "--yes" ||
    value === "--force" ||
    value.startsWith("--stage=") ||
    value.startsWith("--env-file="),
);
if (!allowed) throw new Error("Unsupported self-host deployment option.");

const stage = option("--stage") || "selfhost";
const envFile = path.resolve(option("--env-file") || ".env.selfhost");
const force = arguments_.includes("--force");
if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(stage)) {
  throw new Error("Invalid self-host stage name.");
}
if (stage === "selfhost" && force) {
  throw new Error(
    "Forced reconciliation of the live self-host stack is not supported.",
  );
}

const profileName = process.env.ALCHEMY_PROFILE || "default";
const profileRoot = path.join(homedir(), ".alchemy");
const profileConfig = JSON.parse(
  readFileSync(path.join(profileRoot, "profiles.json"), "utf8"),
) as { profiles?: Record<string, { Cloudflare?: { accountId?: string } }> };
const accountId =
  process.env.CLOUDFLARE_ACCOUNT_ID ||
  profileConfig.profiles?.[profileName]?.Cloudflare?.accountId;
if (!accountId || !/^[0-9a-f]{32}$/i.test(accountId)) {
  throw new Error(
    "A valid Cloudflare account ID is required before deployment.",
  );
}

const credentialsLayer = process.env.CLOUDFLARE_API_TOKEN
  ? Credentials.fromApiToken({ apiToken: process.env.CLOUDFLARE_API_TOKEN })
  : (() => {
      const saved = JSON.parse(
        readFileSync(
          path.join(profileRoot, "credentials", profileName, "cf-oauth.json"),
          "utf8",
        ),
      ) as { access?: string };
      if (!saved.access) throw new Error("Cloudflare OAuth login is missing.");
      return Credentials.fromOAuth({
        load: Effect.succeed({ accessToken: saved.access }),
        refresh: () => Effect.die("Cloudflare OAuth expired; log in again."),
      });
    })();
const cloudflare = Layer.mergeAll(credentialsLayer, FetchHttpClient.layer);
const subdomain = await Effect.runPromise(
  Workers.getSubdomain({ accountId }).pipe(Effect.provide(cloudflare)),
);
const domain = `${workerName(stage)}.${subdomain.subdomain}.workers.dev`;
// Capture before Alchemy plans any writes. Its Access application provider
// does not include oauth_configuration in its PUT body; an in-stack Effect
// runs while planning, *before* the provider reconciles the application.
const oauth = await Effect.runPromise(
  captureManagedOAuth(accountId, domain).pipe(Effect.provide(cloudflare)),
);

function run(command: string, args: string[], environment = process.env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: environment,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args[0] || ""} failed (${result.status ?? result.signal}).`,
    );
  }
}

let deploymentError: unknown;
try {
  run(process.execPath, ["scripts/selfhost-deploy-preflight.mjs"], {
    ...process.env,
    OPENSEO_SELFHOST_ENV_FILE: envFile,
  });
  run("pnpm", ["exec", "vite", "build", "--mode", "selfhost"]);
  run("pnpm", ["exec", "tsc", "--noEmit"]);
  run("pnpm", [
    "alchemy",
    "deploy",
    "--env-file",
    envFile,
    "--stage",
    stage,
    ...(force ? ["--force"] : []),
    ...(arguments_.includes("--yes") ? ["--yes"] : []),
  ]);
} catch (error) {
  deploymentError = error;
}

// Always attempt repair, including when a deploy partially updated Access
// before failing. A failed repair is a hard release failure, never a warning.
if (oauth) {
  try {
    await Effect.runPromise(
      restoreManagedOAuth(accountId, domain, oauth).pipe(
        Effect.provide(cloudflare),
      ),
    );
    console.log(
      "Managed OAuth and redirect allowlist verified after deployment.",
    );
  } catch (restoreError) {
    throw deploymentError
      ? new AggregateError(
          [deploymentError, restoreError],
          "Deployment failed and Managed OAuth could not be restored.",
        )
      : restoreError;
  }
}
if (deploymentError) throw deploymentError;
