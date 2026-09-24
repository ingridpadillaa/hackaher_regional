import { HttpsError } from "firebase-functions/v2/https";
const base = "https://opendata-api.syncfy.com/v1";
export interface IntegrationSecrets {
  syncfyKey?: string;
  syncfyLiveEnabled?: boolean;
  bankDataKey?: string;
  syncfySandbox?: boolean;
  geminiKey?: string;
  geminiModel?: string;
}
export async function syncfyRequest(
  endpoint: string,
  params: Record<string, unknown>,
  method = "GET",
  allowMissing = false,
) {
  const url = new URL(base + endpoint);
  if (method === "GET" || method === "DELETE")
    for (const [k, v] of Object.entries(params))
      url.searchParams.set(k, String(v));
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(["GET", "DELETE"].includes(method)
        ? {}
        : { body: JSON.stringify(params) }),
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new HttpsError(
      "unavailable",
      "Syncfy no respondió. Intenta más tarde.",
    );
  }
  if (method === "DELETE" && allowMissing && response.status === 404)
    return { deleted: true };
  let body: any;
  try {
    body = await response.json();
  } catch {
    throw new HttpsError(
      "unavailable",
      "Syncfy devolvió una respuesta incompleta.",
    );
  }
  if (
    method === "DELETE" &&
    allowMissing &&
    (response.status === 404 || body.code === 404)
  )
    return { deleted: true };
  if (!response.ok || body.status !== true)
    throw new HttpsError(
      "unavailable",
      "No fue posible completar la conexión con Syncfy.",
    );
  return body.response;
}
