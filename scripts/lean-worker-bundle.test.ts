import { describe, expect, it } from "vitest";
import { leanWorkerBundle } from "../vite-plugin-lean-worker-bundle";

function generateWorkerBundle(environment: string, moduleId: string) {
  const hook = leanWorkerBundle().generateBundle;
  if (typeof hook !== "function") throw new Error("Missing bundle guard");
  Reflect.apply(
    hook,
    {
      environment: { name: environment },
      error(message: string): never {
        throw new Error(message);
      },
    },
    [
      {},
      {
        "index.js": {
          type: "chunk",
          fileName: "index.js",
          isEntry: true,
          imports: [],
          dynamicImports: ["lazy.js"],
          moduleIds: ["/src/server.ts"],
        },
        "lazy.js": {
          type: "chunk",
          fileName: "lazy.js",
          isEntry: false,
          imports: [],
          moduleIds: [moduleId],
        },
      },
    ],
  );
}

describe.each(["ssr", "open_seo_audit"])(
  "%s security bundle boundary",
  (name) => {
    it.each(["just-bash", "sprintf-js"])(
      "rejects %s even when it is only dynamically imported",
      (dependency) => {
        expect(() =>
          generateWorkerBundle(name, `/node_modules/${dependency}/index.js`),
        ).toThrow("Disabled bash dependencies entered a Worker bundle.");
      },
    );

    it("allows the disabled-tool stub", () => {
      expect(() =>
        generateWorkerBundle(name, "/src/server/lib/just-bash-stub.ts"),
      ).not.toThrow();
    });
  },
);
