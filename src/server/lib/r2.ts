import { env } from "cloudflare:workers";

export async function getJsonFromR2(key: string): Promise<string | null> {
  const object = await env.R2.get(key);
  if (!object) {
    return null;
  }

  return object.text();
}

export async function putTextToR2(
  key: string,
  body: string,
): Promise<{ key: string; sizeBytes: number }> {
  await env.R2.put(key, body, {
    httpMetadata: {
      contentType: "application/json",
    },
  });

  return {
    key,
    sizeBytes: Buffer.byteLength(body),
  };
}
