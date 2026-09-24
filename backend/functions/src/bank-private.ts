import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import {
  getFirestore,
  Timestamp,
  type DocumentReference,
} from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { syncfyRequest, type IntegrationSecrets } from "./banking";
import { categories, today } from "./domain";
const db = () => getFirestore();
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const modeSchema = z.enum(["sandbox", "live"]);
const ident = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const consentVersion = "bank-read-v1";
const fail = (message: string) =>
  new HttpsError("failed-precondition", message);
export function safeDescription(s: unknown) {
  return String(s ?? "")
    .replace(/\b\d[\d -]{8,}\d\b/g, "[dato oculto]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[correo oculto]")
    .slice(0, 180);
}
export function normalizeBankRows(
  rows: any[],
  accountId: string,
  uid: string,
  from: string,
  to: string,
) {
  const seen = new Set<string>();
  return rows.flatMap((r) => {
    const stamp = Number(r.dt_transaction);
    if (!Number.isFinite(stamp) || stamp <= 0 || stamp > 8640000000000)
      return [];
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Monterrey",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(stamp * 1000));
    if (
      r.id_account !== accountId ||
      !/^[\w-]{1,128}$/.test(r.id_transaction ?? "") ||
      r.currency !== "MXN" ||
      r.is_pending !== 0 ||
      r.is_deleted === 1 ||
      r.is_disable === 1 ||
      typeof r.amount !== "number" ||
      !Number.isFinite(r.amount) ||
      r.amount === 0 ||
      Math.abs(r.amount) > 10000000 ||
      Math.round(Math.abs(r.amount) * 100) === 0 ||
      date < from ||
      date > to
    )
      return [];
    const id = digest(`${uid}:${accountId}:${r.id_transaction}`);
    if (seen.has(id)) return [];
    seen.add(id);
    return [
      {
        id,
        date,
        amount: Math.round(Math.abs(r.amount) * 100) / 100,
        description: safeDescription(r.description),
        direction: r.amount < 0 ? "cargo" : "abono",
      },
    ];
  });
}
function key(config: IntegrationSecrets) {
  if (!/^[a-f0-9]{64}$/i.test(config.bankDataKey ?? ""))
    throw fail("Falta configurar la protección de los borradores bancarios.");
  return Buffer.from(config.bankDataKey!, "hex");
}
export function seal(
  data: unknown,
  config: IntegrationSecrets,
  context: string,
) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(config), iv);
  cipher.setAAD(Buffer.from(context));
  const value = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  return {
    iv: iv.toString("base64"),
    value: value.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}
export function unseal(data: any, config: IntegrationSecrets, context: string) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(config),
    Buffer.from(data.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(data.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(data.value, "base64")),
      decipher.final(),
    ]).toString("utf8"),
  );
}
export async function bankAvailability(config: IntegrationSecrets) {
  if (!config.syncfyKey) throw fail("Falta configurar Syncfy.");
  const sites = await syncfyRequest("/catalogues/sites", {
    api_key: config.syncfyKey,
  });
  if (!Array.isArray(sites))
    throw fail("No pudimos verificar el catálogo de Syncfy.");
  const bbva = sites.filter(
    (s) => /bbva/i.test(s.name ?? "") && s.is_personal === 1,
  );
  const sandbox = bbva.filter(
    (s) =>
      /sandbox|test|prueba/i.test(s.name ?? "") ||
      s.is_test === true ||
      s.is_test === 1,
  );
  const live = bbva.filter((s) => !sandbox.includes(s));
  return {
    live: live.map((s) => ({ id: s.id_site, name: s.name })),
    sandbox: sandbox.map((s) => ({ id: s.id_site, name: s.name })),
    liveEnabled:
      config.syncfyLiveEnabled === true &&
      live.length > 0 &&
      process.env.FUNCTIONS_EMULATOR !== "true",
    requiresDeployment: process.env.FUNCTIONS_EMULATOR === "true",
  };
}
// Serializes local import/revoke/session changes. Provider calls never run inside a retried transaction.
async function exclusive<T>(
  uid: string,
  mode: string,
  work: (ref: any) => Promise<T>,
): Promise<T> {
  const ref = db().doc(`privateBankConnections/${uid}/modes/${mode}`),
    lease = randomBytes(16).toString("hex");
  await db().runTransaction(async (t) => {
    const s = await t.get(ref);
    if ((s.data()?.lockUntil ?? 0) > Date.now())
      throw new HttpsError(
        "aborted",
        "Hay una operación bancaria en curso. Espera y vuelve a intentar.",
      );
    t.set(
      ref,
      { lock: lease, lockUntil: Date.now() + 180000 },
      { merge: true },
    );
  });
  try {
    return await work(ref);
  } finally {
    await db().runTransaction(async (t) => {
      const s = await t.get(ref);
      if (s.data()?.lock === lease) t.update(ref, { lockUntil: 0, lock: "" });
    });
  }
}
async function session(
  ref: any,
  uid: string,
  mode: string,
  homeId: string,
  config: IntegrationSecrets,
) {
  const data = (await ref.get()).data() ?? {};
  if (
    data.consentVersion !== consentVersion ||
    data.revoking ||
    data.homeId !== homeId
  )
    throw fail("Autoriza primero la consulta bancaria para tu cuenta.");
  let external = data.externalUserId;
  if (!external) {
    const externalId =
      data.externalId ??
      digest(
        `${process.env.GCLOUD_PROJECT}:${uid}:${mode}:${randomBytes(16).toString("hex")}`,
      );
    await ref.set({ externalId }, { merge: true });
    const users = await syncfyRequest("/users", {
      api_key: config.syncfyKey,
      id_external: externalId,
    });
    const found = Array.isArray(users)
      ? users.find((u) => u.id_external === externalId)
      : null;
    const created =
      found ??
      (await syncfyRequest(
        "/users",
        {
          api_key: config.syncfyKey,
          id_external: externalId,
          name: "Summa private banking",
        },
        "POST",
      ));
    external = ident.parse(created.id_user);
    await ref.set({ externalUserId: external }, { merge: true });
  }
  const s = await syncfyRequest(
    "/sessions",
    { api_key: config.syncfyKey, id_user: external },
    "POST",
  );
  if (typeof s?.token !== "string")
    throw fail("No pudimos crear una sesión con Syncfy.");
  return s.token;
}
export async function privateBankAction(
  uid: string,
  home: any,
  homeData: any,
  authTime: number,
  action: string,
  p: any,
  config: IntegrationSecrets,
) {
  if (action === "bankAvailability") return bankAvailability(config);
  const mode = modeSchema.parse(p.mode);
  if (action === "bankDiscardReview") {
    await db()
      .doc(
        `privateBankConnections/${uid}/modes/${mode}/bankReviewDrafts/current`,
      )
      .delete();
    return { ok: true };
  }
  if (action === "bankConnectionStatus") {
    const s = (
      await db().doc(`privateBankConnections/${uid}/modes/${mode}`).get()
    ).data();
    return {
      consented:
        s?.consentVersion === consentVersion &&
        s?.homeId === home.id &&
        !s?.revoking,
      connected: !!s?.connected,
      revoking: !!s?.revoking,
      lastSync: s?.lastSync ?? null,
    };
  }
  if (!Number.isFinite(authTime) || Date.now() / 1000 - authTime > 900)
    throw new HttpsError(
      "unauthenticated",
      "Por seguridad, cierra sesión y vuelve a entrar para gestionar tu banco.",
    );
  if (
    mode === "live" &&
    homeData.esDemo &&
    !["bankDisconnect", "bankEraseImports"].includes(action)
  )
    throw fail(
      "Usa una cuenta personal y un hogar privado; no conectes tu banco real al hogar de demostración.",
    );
  if (
    mode === "live" &&
    !["bankDisconnect", "bankEraseImports"].includes(action) &&
    (process.env.FUNCTIONS_EMULATOR === "true" ||
      config.syncfyLiveEnabled !== true)
  )
    throw fail(
      "La banca real requiere el servicio publicado y habilitado; no está disponible en emuladores.",
    );
  if (!["bankDisconnect", "bankEraseImports"].includes(action)) key(config);
  return exclusive(uid, mode, async (ref) => {
    if (action === "bankDisconnect") {
      const data = (await ref.get()).data() ?? {};
      await ref.collection("bankReviewDrafts").doc("current").delete();
      await ref.set(
        { consentVersion: null, revoking: true, connected: false },
        { merge: true },
      );
      if (data.externalUserId)
        await syncfyRequest(
          `/users/${ident.parse(data.externalUserId)}`,
          { api_key: config.syncfyKey },
          "DELETE",
          true,
        );
      await ref.collection("bankReviewDrafts").doc("current").delete();
      await ref.set(
        {
          externalUserId: null,
          externalId: null,
          revoking: false,
          disconnectedAt: new Date().toISOString(),
          lastSync: null,
        },
        { merge: true },
      );
      return { ok: true, retainedImports: true };
    }
    if (action === "bankEraseImports") {
      await ref.collection("bankReviewDrafts").doc("current").delete();
      const snap = await home
        .collection("movements")
        .where("ownerUid", "==", uid)
        .get();
      const docs = snap.docs.filter(
        (d: any) => d.data().bankMode === mode && d.data().source === "syncfy",
      );
      for (let i = 0; i < docs.length; i += 200) {
        const batch = db().batch();
        for (const d of docs.slice(i, i + 200)) {
          batch.delete(d.ref);
          batch.delete(
            db().doc(`privateBankImports/${uid}/items/${d.data().bankId}`),
          );
        }
        await batch.commit();
      }
      return { deleted: docs.length };
    }
    if (action === "bankAuthorize" || action === "bankConnect") {
      const availability = await bankAvailability(config);
      if (mode === "live" && !availability.liveEnabled)
        throw fail(
          "Syncfy aún no habilita BBVA real para esta integración. No introduzcas tus datos en sandbox.",
        );
      const sites = availability[mode];
      if (!sites.length)
        throw fail(
          "No hay un conector BBVA personal disponible en este entorno.",
        );
      if (action === "bankAuthorize") {
        if (p.accept !== true)
          throw fail("Acepta el consentimiento para continuar.");
        const prior = (await ref.get()).data();
        if (prior?.revoking)
          throw fail("Completa primero la desconexión pendiente.");
        if (prior?.homeId && prior.homeId !== home.id && prior.externalUserId)
          throw fail("Desconecta primero tu vínculo bancario anterior.");
        await ref.set(
          {
            consentVersion,
            homeId: home.id,
            consentedAt: new Date().toISOString(),
            mode,
          },
          { merge: true },
        );
      }
      const token = await session(ref, uid, mode, home.id, config);
      return { token, sandbox: mode === "sandbox", siteId: sites[0].id };
    }
    const token = await session(ref, uid, mode, home.id, config);
    if (action === "bankAccounts" || action === "bankPreview") {
      const accounts = await syncfyRequest("/accounts", { token, limit: 100 });
      if (!Array.isArray(accounts))
        throw fail("Respuesta bancaria incompleta.");
      const availability = await bankAvailability(config);
      const sites = new Set(availability[mode].map((s) => s.id));
      const owned = accounts.filter(
        (a) =>
          sites.has(a.id_site) && a.is_disable !== 1 && a.currency === "MXN",
      );
      if (action === "bankAccounts") {
        await ref.set(
          {
            connected: owned.length > 0,
            accountCount: owned.length,
            lastSync: new Date().toISOString(),
          },
          { merge: true },
        );
        return owned.map((a) => ({
          id: ident.parse(a.id_account),
          name: safeDescription(a.name),
          last4: String(a.number ?? "").slice(-4),
          type: safeDescription(a.account_type),
          currency: "MXN",
        }));
      }
      const accountId = ident.parse(p.accountId),
        account = owned.find((a) => a.id_account === accountId);
      if (!account)
        throw new HttpsError(
          "permission-denied",
          "Selecciona una cuenta propia disponible.",
        );
      const skip = z.number().int().min(0).max(5000).default(0).parse(p.skip);
      const end = today(),
        fromDate = new Date(end + "T12:00:00Z");
      fromDate.setUTCDate(fromDate.getUTCDate() - 30);
      const from = fromDate.toISOString().slice(0, 10);
      const raw = await syncfyRequest("/transactions", {
        token,
        id_account: accountId,
        limit: 101,
        skip,
        dt_transaction_from: Math.floor(
          new Date(from + "T00:00:00-06:00").getTime() / 1000,
        ),
        dt_transaction_to: Math.floor(Date.now() / 1000),
      });
      if (!Array.isArray(raw))
        throw fail("Respuesta de movimientos incompleta.");
      const normalized = normalizeBankRows(
        raw.slice(0, 100),
        accountId,
        `${uid}:${mode}`,
        from,
        end,
      );
      const imports = normalized.length
        ? await db().getAll(
            ...normalized.map((r) =>
              db().doc(`privateBankImports/${uid}/items/${r.id}`),
            ),
          )
        : [];
      const recent = await home
        .collection("movements")
        .where("date", ">=", from)
        .get();
      const rows = normalized.map((r, i) => ({
        ...r,
        imported: imports[i].exists,
        possibleDuplicate: recent.docs.some((d: any) => {
          const m = d.data();
          return (
            (!m.private || m.ownerUid === uid) &&
            m.date === r.date &&
            m.amount === r.amount
          );
        }),
      }));
      const draftId = randomBytes(16).toString("hex"),
        expiresAt = Date.now() + 5 * 60000;
      await ref
        .collection("bankReviewDrafts")
        .doc("current")
        .set({
          draftId,
          expiresAt: Timestamp.fromMillis(expiresAt),
          sealed: seal(
            { rows, homeId: home.id },
            config,
            `${uid}:${mode}:${draftId}`,
          ),
        });
      return {
        draftId,
        rows,
        from,
        to: end,
        hasMore: raw.length > 100,
        nextSkip: skip + 100,
        skipped: Math.min(raw.length, 100) - rows.length,
        sandbox: mode === "sandbox",
      };
    }
    if (action === "bankImport") {
      if (mode === "sandbox" && !homeData.esDemo)
        throw fail(
          "Los movimientos ficticios solo se importan en hogares de demostración.",
        );
      const input = z
        .object({
          draftId: ident,
          items: z
            .array(
              z.object({
                id: ident,
                type: z.enum(["gasto", "ingreso", "transferencia"]),
                category: z.enum(categories),
                incomeKind: z.enum(["regular", "extra"]).default("extra"),
                allowDuplicate: z.boolean().default(false),
              }),
            )
            .min(1)
            .max(100),
        })
        .parse(p);
      const draftRef: DocumentReference = ref
        .collection("bankReviewDrafts")
        .doc("current");
      return db().runTransaction(async (t) => {
        const draft = (await t.get(draftRef)).data();
        if (
          !draft ||
          draft.draftId !== input.draftId ||
          draft.expiresAt.toMillis() < Date.now()
        )
          throw fail("La revisión venció. Consulta de nuevo los movimientos.");
        const payload = unseal(
          draft.sealed,
          config,
          `${uid}:${mode}:${input.draftId}`,
        );
        if (payload.homeId !== home.id)
          throw fail("La revisión pertenece a otro hogar.");
        const selected = input.items.map((i) => {
          const r = payload.rows.find((r: any) => r.id === i.id);
          if (!r) throw fail("Movimiento fuera de la revisión.");
          if (r.possibleDuplicate && !i.allowDuplicate)
            throw fail("Confirma el posible duplicado antes de importarlo.");
          return { ...r, ...i };
        });
        if (new Set(selected.map((r) => r.id)).size !== selected.length)
          throw fail("Selección duplicada.");
        const refs = selected.map((r) =>
          db().doc(`privateBankImports/${uid}/items/${r.id}`),
        );
        const receipts = await t.getAll(...refs);
        let imported = 0;
        selected.forEach((r, i) => {
          if (receipts[i].exists) return;
          const movement = home
            .collection("movements")
            .doc(`bank-${mode}-${r.id}`);
          t.create(movement, {
            type: r.type,
            amount: r.amount,
            category: r.category,
            incomeKind: r.incomeKind,
            note: r.description,
            date: r.date,
            method: "manual",
            source: "syncfy",
            bankId: r.id,
            bankMode: mode,
            ownerUid: uid,
            private: true,
            esPrueba: mode === "sandbox",
            createdAt: new Date().toISOString(),
          });
          t.create(refs[i], {
            homeId: home.id,
            movementId: movement.id,
            createdAt: new Date().toISOString(),
          });
          imported++;
        });
        return { imported, alreadyImported: selected.length - imported };
      });
    }
    throw new HttpsError("invalid-argument", "Operación bancaria desconocida.");
  });
}
