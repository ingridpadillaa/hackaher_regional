import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { createHash } from "node:crypto";
const base = "https://opendata-api.syncfy.com/v1";
export interface IntegrationSecrets {
  syncfyKey?: string;
  syncfySandbox?: boolean;
  geminiKey?: string;
  geminiModel?: string;
}
export async function syncfyRequest(
  endpoint: string,
  params: Record<string, unknown>,
  method = "GET",
) {
  const url = new URL(base + endpoint);
  if (method === "GET")
    for (const [k, v] of Object.entries(params))
      url.searchParams.set(k, String(v));
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(method === "GET" ? {} : { body: JSON.stringify(params) }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new HttpsError(
      "unavailable",
      "Syncfy no respondió. Intenta más tarde.",
    );
  }
  const body: any = await response.json();
  if (!response.ok || body.status !== true)
    throw new HttpsError(
      "unavailable",
      "No fue posible completar la conexión con Syncfy.",
    );
  return body.response;
}
export async function bankSession(uid: string, config: IntegrationSecrets) {
  if (!config.syncfyKey)
    throw new HttpsError("failed-precondition", "Falta configurar Syncfy.");
  // Production banking remains gated until its contract and account types are validated.
  if (config.syncfySandbox !== true)
    throw new HttpsError(
      "failed-precondition",
      "La conexión de producción aún requiere validación.",
    );
  const db = getFirestore();
  const ref = db.doc(`bankConnections/${uid}`);
  let external = (await ref.get()).data()?.externalUserId;
  if (!external) {
    const externalId = createHash("sha256")
      .update("summa:" + uid)
      .digest("hex");
    const existing = await syncfyRequest("/users", {
      api_key: config.syncfyKey,
      id_external: externalId,
    });
    const found = Array.isArray(existing)
      ? existing.find((x: any) => x.id_external === externalId)
      : null;
    const user =
      found ??
      (await syncfyRequest(
        "/users",
        {
          api_key: config.syncfyKey,
          id_external: externalId,
          name: "Summa sandbox",
        },
        "POST",
      ));
    external = user.id_user;
    if (typeof external !== "string")
      throw new HttpsError(
        "unavailable",
        "Syncfy no devolvió un usuario válido.",
      );
    await ref.set(
      { externalUserId: external, provider: "syncfy", sandbox: true },
      { merge: true },
    );
  }
  const session = await syncfyRequest(
    "/sessions",
    { api_key: config.syncfyKey, id_user: external },
    "POST",
  );
  if (typeof session?.token !== "string")
    throw new HttpsError(
      "unavailable",
      "No pudimos abrir una sesión bancaria.",
    );
  return { token: session.token, sandbox: true };
}
export async function syncBank(uid: string, config: IntegrationSecrets) {
  const session = await bankSession(uid, config);
  const accounts = await syncfyRequest("/accounts", {
    token: session.token,
    limit: 100,
  });
  const transactions = await syncfyRequest("/transactions", {
    token: session.token,
    limit: 100,
  });
  const accountCount = Array.isArray(accounts) ? accounts.length : 0;
  const transactionCount = Array.isArray(transactions)
    ? transactions.length
    : 0;
  // Sandbox counts only. Never manufacture real savings evidence or import test balances into households.
  await getFirestore()
    .doc(`bankConnections/${uid}`)
    .set(
      {
        sandbox: true,
        accountCount,
        transactionCount,
        connected: accountCount > 0,
        lastSync: new Date().toISOString(),
      },
      { merge: true },
    );
  return {
    sandbox: true,
    accountCount,
    transactionCount,
    connected: accountCount > 0,
  };
}
