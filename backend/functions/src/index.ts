import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineJsonSecret } from "firebase-functions/params";
import { type IntegrationSecrets } from "./banking";
import { privateBankAction } from "./bank-private";
import { extractMovements } from "./extraction";
import { replyToChat } from "./jami";
import {
  dateSchema,
  savingsSchema,
  scheduleSchema,
  nextOccurrence,
  ledgerSummary,
  savingsStats,
} from "./finance";
import { compareStores, catalogStores } from "./catalog";
import { prepareHebCart } from "./retailer-cart";
import {
  coordinatesSchema,
  locationSchema,
  normalize,
  reverseGeocode,
} from "./location";
import { ruleKey } from "./receipts";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  categories,
  homeSchema,
  preferencesSchema,
  movementSchema,
  cartSchema,
  today,
  round,
  monthlyIncome,
  seasonalForecast,
  verifiedStreak,
} from "./domain";
const integrations = defineJsonSecret<IntegrationSecrets>("SUMMA_INTEGRATIONS");
initializeApp();
const db = getFirestore();
setGlobalOptions({
  region: "us-central1",
  maxInstances: 3,
  memory: "512MiB",
  timeoutSeconds: 120,
});
const id = z.string().regex(/^[\w-]{1,128}$/);
const collections = [
  "members",
  "movements",
  "goals",
  "bankEvidence",
  "notifications",
] as const;
const rows = async (ref: any) => {
  const s = await ref.get();
  return s.docs.map((d: any) => ({ id: d.id, ...d.data() }));
};
async function context(uid: string) {
  const u = await db.doc(`usuarios/${uid}`).get();
  const user = u.data();
  if (!user?.hogarId)
    throw new HttpsError("failed-precondition", "Primero crea tu hogar.");
  const home = db.doc(`hogares/${id.parse(user.hogarId)}`);
  const [h, m] = await Promise.all([
    home.get(),
    home.collection("members").doc(uid).get(),
  ]);
  if (!h.exists || !m.exists)
    throw new HttpsError("permission-denied", "No tienes acceso a este hogar.");
  return { user, home, data: h.data()! };
}
async function rateLimit(uid: string, kind: string, limit: number) {
  const bucket = Math.floor(Date.now() / 60000);
  const ref = db.doc(`rateLimits/${uid}_${kind}_${bucket}`);
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const n = snap.data()?.count ?? 0;
    if (n >= limit)
      throw new HttpsError(
        "resource-exhausted",
        "Espera un minuto antes de volver a intentar.",
      );
    t.set(ref, { count: n + 1, expiresAt: new Date(Date.now() + 3600000) });
  });
}
// Additive, transactional migration: old movements and member identities stay intact.
async function ensureFinanceSchema(home: any) {
  await db.runTransaction(async (t) => {
    const snapshot: any = await t.get(home);
    const old = snapshot.data() as any;
    if ((old.schemaVersion ?? 1) >= 2) return;
    const goals = await t.get(home.collection("goals"));
    const members = await t.get(home.collection("members"));
    for (const doc of goals.docs) {
      const g = doc.data() as any;
      if (g.saved > 0)
        t.set(home.collection("savingsEntries").doc(`opening_${doc.id}`), {
          goalId: doc.id,
          type: "opening",
          amount: g.saved,
          date: today(),
          source: "legacy",
          verified: false,
          note: "Saldo previo conservado; no acredita racha ni verificación bancaria.",
          createdAt: new Date().toISOString(),
        });
    }
    for (const doc of members.docs) {
      const m = doc.data() as any;
      t.set(home.collection("incomePlans").doc(doc.id), {
        memberId: doc.id,
        amount: m.income ?? 0,
        frequency: m.period ?? "mensual",
        nextDate: null,
        source: "profile",
        active: true,
      });
    }
    t.update(home, {
      schemaVersion: 2,
      currency: "MXN",
      timezone: "America/Monterrey",
      migratedAt: new Date().toISOString(),
    });
    t.set(home.collection("budgets").doc(today().slice(0, 7)), {
      amount: old.preferences?.monthlyBudget ?? 0,
      source: "legacy",
      updatedAt: new Date().toISOString(),
    });
  });
}
async function monthReport(home: any, uid: string, month: string) {
  const [list, budget] = await Promise.all([
    rows(
      home
        .collection("movements")
        .where("date", ">=", month + "-01")
        .where("date", "<=", month + "-31")
        .orderBy("date", "desc"),
    ),
    home.collection("budgets").doc(month).get(),
  ]);
  const movements = list.filter((m: any) => !m.private || m.ownerUid === uid);
  return {
    month,
    movements,
    summary: ledgerSummary(movements, budget.data()?.amount ?? 0),
  };
}
async function invitationExpiry(home: any, code: string) {
  const ref = db.doc(`invitations/${code}`);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const inv = snap.data();
    if (!inv || inv.revoked) return null;
    if (inv.expiresAt) return inv.expiresAt;
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    t.update(ref, { expiresAt, revoked: false });
    t.update(home, { invitationExpiresAt: expiresAt });
    return expiresAt;
  });
}
async function bootstrap(uid: string, name: string, email: string) {
  const ref = db.doc(`usuarios/${uid}`);
  await db.runTransaction(async (t) => {
    const s = await t.get(ref);
    if (!s.exists)
      t.create(ref, {
        nombre: name || email.split("@")[0],
        email,
        personalizacionCompleta: false,
        creadoEn: new Date().toISOString(),
      });
  });
  const user = (await ref.get()).data()!;
  if (!user.hogarId) return { user, home: null };
  const { home, data } = await context(uid);
  await ensureFinanceSchema(home);
  const invitationExpiresAt = await invitationExpiry(home, data.invitationCode);
  // New React schema intentionally separate from legacy Python collections.
  const [members, goals, bankEvidence, notifications] = await Promise.all([
    rows(home.collection("members")),
    rows(home.collection("goals")),
    rows(home.collection("bankEvidence").orderBy("date", "desc").limit(366)),
    rows(
      home.collection("notifications").orderBy("createdAt", "desc").limit(40),
    ),
  ]);
  const date = today();
  const month = date.slice(0, 7);
  const movements = await rows(
    home
      .collection("movements")
      .where("date", ">=", `${month}-01`)
      .where("date", "<=", `${month}-31`)
      .orderBy("date", "desc"),
  );
  const forecastHistory = await rows(
    home
      .collection("movements")
      .where("date", ">=", `${Number(date.slice(0, 4)) - 1}-01-01`)
      .orderBy("date", "desc")
      .limit(5000),
  );
  const visible = (list: any[]) =>
    list.filter((m) => !m.private || m.ownerUid === uid);
  const report = await monthReport(home, uid, month);
  const summary = report.summary;
  const [savingsEntries, schedules] = await Promise.all([
    rows(home.collection("savingsEntries").orderBy("date", "desc")),
    rows(home.collection("schedules").orderBy("nextDate", "asc")),
  ]);
  const forecast = seasonalForecast(date, visible(forecastHistory));
  const alerts: any[] = [];
  if (data.preferences?.alerts !== false) {
    if (summary.expenses > summary.budget && summary.budget > 0)
      alerts.push({
        id: "budget-" + month,
        title: "Te pasaste del presupuesto",
        message: `Este mes llevas $${round(summary.expenses - summary.budget).toFixed(2)} por encima.`,
        kind: "budget",
      });
    else if (summary.budget && summary.expenses / summary.budget >= 0.8)
      alerts.push({
        id: "budget-" + month,
        title: "Tu presupuesto necesita atención",
        message: "Ya utilizaste al menos el 80% de tu presupuesto mensual.",
        kind: "budget",
      });
    if (summary.expenses > 0)
      alerts.push({
        id: "emergency-" + month,
        title: "Tu fondo de emergencia",
        message:
          "Separa una parte de tu ahorro para imprevistos y define una meta en el simulador.",
        kind: "recommendation",
      });
    alerts.push({
      id: "season-" + forecast.date,
      title: forecast.name,
      message:
        forecast.extra === null
          ? "Se acerca esta fecha. Aún necesitamos historial comparable para estimar tu gasto adicional."
          : `Podrías gastar $${forecast.extra.toFixed(2)} adicionales. Es una estimación de tu historial.`,
      kind: "forecast",
    });
  }
  const cart =
    (await home.collection("cart").doc("current").get()).data()?.items ?? [];
  const read =
    (await home.collection("readNotifications").doc(uid).get()).data()?.ids ??
    [];
  const filteredNotifications = notifications.filter(
    (n: any) =>
      (!n.ownerUid || n.ownerUid === uid) &&
      (n.kind !== "goal" || data.preferences?.goals !== false) &&
      (n.kind !== "donation" || data.preferences?.donations === true),
  );
  const liveBank = (
    await db.doc(`privateBankConnections/${uid}/modes/live`).get()
  ).data();
  const sandboxBank = (
    await db.doc(`privateBankConnections/${uid}/modes/sandbox`).get()
  ).data();
  return {
    user,
    home: {
      id: home.id,
      ...data,
      schemaVersion: 2,
      invitationExpiresAt,
      members,
    },
    movements: visible(movements),
    goals,
    savingsEntries,
    savings: savingsStats(savingsEntries, date),
    schedules,
    expectedIncome: monthlyIncome(members),
    summary,
    forecast,
    cart,
    notifications: [...alerts, ...filteredNotifications].map((n) => ({
      ...n,
      read: read.includes(n.id),
    })),
    bank: {
      connected: liveBank?.connected === true && !liveBank?.revoking,
      sandbox: sandboxBank?.connected === true && !liveBank?.connected,
      sandboxConnected: sandboxBank?.connected === true,
      sandboxAccountCount: sandboxBank?.accountCount ?? 0,
      sandboxTransactionCount: sandboxBank?.transactionCount ?? 0,
      sandboxLastSync: sandboxBank?.lastSync ?? null,
      lastSync: liveBank?.lastSync ?? null,
      streak: verifiedStreak(bankEvidence, date),
    },
    date,
  };
}
async function analyze(uid: string, input: any) {
  const { home, data } = await context(uid);
  if (!data.preferences?.aiConsent)
    throw new HttpsError(
      "failed-precondition",
      "Este hogar no autorizó el uso de IA durante su registro. Puedes usar captura manual.",
    );
  await rateLimit(uid, "ai", 5);
  const extracted = await extractMovements(
    input,
    integrations.value(),
    today(),
  );
  const result = {
    ...extracted,
    movements: extracted.movements.map((m) => ({
      ...m,
      ruleApplied: false,
      possibleDuplicate: false,
    })),
  };
  const sourceHash = createHash("sha256")
    .update(input.base64 ?? input.text ?? "")
    .digest("hex");
  const previousSource = await home
    .collection("analyzedSources")
    .doc(sourceHash)
    .get();
  const recent = await rows(
    home.collection("movements").orderBy("date", "desc").limit(500),
  );
  for (const movement of result.movements) {
    const rule = movement.note
      ? await home.collection("categoryRules").doc(ruleKey(movement.note)).get()
      : null;
    if (rule?.exists) {
      movement.category = rule.data()!.category;
      movement.ruleApplied = true;
    }
    movement.possibleDuplicate =
      previousSource.exists ||
      recent.some(
        (m: any) =>
          (!m.private || m.ownerUid === uid) &&
          m.date === movement.date &&
          m.type === movement.type &&
          m.amount === movement.amount &&
          ruleKey(m.note ?? "") === ruleKey(movement.note ?? ""),
      );
  }
  const draft = home.collection("drafts").doc();
  await draft.set({
    ...result,
    sourceHash,
    method: input.method,
    model: integrations.value().geminiModel,
    ownerUid: uid,
    expiresAt: new Date(Date.now() + 3600000),
  });
  return { ...result, draftId: draft.id };
}
async function handle(
  uid: string,
  action: string,
  p: any,
  token: any,
): Promise<any> {
  if (action === "bootstrap")
    return bootstrap(uid, token.name ?? "", token.email ?? "");
  if (action === "chat") {
    const message = z.string().trim().min(1).max(2000).parse(p.message);
    await rateLimit(uid, "jami", 10);
    const state = await bootstrap(uid, token.name ?? "", token.email ?? "");
    const history = z
      .array(z.string().max(2000))
      .max(4)
      .default([])
      .parse(p.history);
    return replyToChat(message, state, integrations.value(), history);
  }
  if (action === "previewInvitation") {
    const code = z
      .string()
      .trim()
      .regex(/^(?:[A-F0-9]{16}|[A-F0-9]{32})$/)
      .parse(p.code);
    await rateLimit(uid, "invite-preview", 10);
    const inv = (await db.doc(`invitations/${code}`).get()).data();
    if (
      !inv ||
      inv.revoked ||
      !inv.expiresAt ||
      Date.parse(inv.expiresAt) <= Date.now()
    )
      throw new HttpsError(
        "not-found",
        "La invitación caducó o fue revocada. Solicita una nueva.",
      );
    const h = (await db.doc(`hogares/${inv.homeId}`).get()).data();
    if (!h) throw new HttpsError("not-found", "Hogar no encontrado.");
    return { name: h.name, expiresAt: inv.expiresAt };
  }
  if (action === "createHome") {
    const parsed = homeSchema.parse(p);
    const ref = db.doc(`usuarios/${uid}`);
    const home = db.collection("hogares").doc();
    const code = randomBytes(16).toString("hex").toUpperCase();
    await db.runTransaction(async (t) => {
      const u = await t.get(ref);
      if (u.data()?.hogarId)
        throw new HttpsError("already-exists", "Ya tienes un hogar.");
      t.create(home, {
        name: parsed.name,
        ownerUid: uid,
        invitationCode: code,
        createdAt: new Date().toISOString(),
      });
      parsed.members.forEach((m, i) =>
        t.create(
          home
            .collection("members")
            .doc(i === 0 ? uid : db.collection("_ids").doc().id),
          { ...m, id: undefined, accountUid: i === 0 ? uid : null },
        ),
      );
      t.set(
        ref,
        {
          nombre: token.name || parsed.members[0].name,
          email: token.email ?? "",
          hogarId: home.id,
          rol: "admin",
          personalizacionCompleta: false,
        },
        { merge: true },
      );
      t.create(db.doc(`invitations/${code}`), {
        homeId: home.id,
        createdBy: uid,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        revoked: false,
      });
    });
    return { ok: true };
  }
  if (action === "joinHome") {
    const code = z
      .string()
      .trim()
      .regex(/^(?:[A-F0-9]{16}|[A-F0-9]{32})$/)
      .parse(p.code);
    await rateLimit(uid, "join", 5);
    await db.runTransaction(async (t) => {
      const ref = db.doc(`usuarios/${uid}`);
      const u = await t.get(ref);
      if (u.data()?.hogarId)
        throw new HttpsError("already-exists", "Ya perteneces a un hogar.");
      const inv = await t.get(db.doc(`invitations/${code}`));
      if (
        !inv.exists ||
        inv.data()?.revoked ||
        !inv.data()?.expiresAt ||
        Date.parse(inv.data()!.expiresAt) <= Date.now()
      )
        throw new HttpsError(
          "not-found",
          "La invitación caducó o fue revocada. Solicita una nueva.",
        );
      const h = db.doc(`hogares/${inv.data()!.homeId}`);
      const hs = await t.get(h);
      const members = await t.get(h.collection("members"));
      if (members.size >= 20)
        throw new HttpsError(
          "failed-precondition",
          "El hogar ya tiene 20 integrantes.",
        );
      t.create(h.collection("members").doc(uid), {
        name: token.name ?? token.email?.split("@")[0] ?? "Integrante",
        age: 0,
        relationship: "Adulto",
        education: "",
        occupation: "",
        income: 0,
        period: "mensual",
        accountUid: uid,
      });
      t.set(
        ref,
        { hogarId: h.id, rol: "integrante", personalizacionCompleta: false },
        { merge: true },
      );
      if (!hs.exists) throw new HttpsError("not-found", "Hogar no encontrado.");
    });
    return { ok: true };
  }
  if (action === "analyze") return analyze(uid, p);
  const { home, data, user } = await context(uid);
  if (action === "reverseLocation") {
    await rateLimit(uid, "reverse-location", 5);
    const coordinates = coordinatesSchema.parse(p);
    try {
      return await reverseGeocode(coordinates.latitude, coordinates.longitude);
    } catch {
      throw new HttpsError(
        "unavailable",
        "Obtuvimos tus coordenadas, pero no pudimos identificar la zona. Confirma municipio y estado manualmente.",
      );
    }
  }
  if (action === "rotateInvitation" || action === "revokeInvitation") {
    if (data.ownerUid !== uid)
      throw new HttpsError(
        "permission-denied",
        "Solo quien administra puede gestionar invitaciones.",
      );
    await db.runTransaction(async (t) => {
      const h = await t.get(home);
      const old = h.data()!.invitationCode;
      t.set(db.doc(`invitations/${old}`), { revoked: true }, { merge: true });
      if (action === "rotateInvitation") {
        const code = randomBytes(16).toString("hex").toUpperCase();
        const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
        t.create(db.doc(`invitations/${code}`), {
          homeId: home.id,
          createdBy: uid,
          expiresAt,
          revoked: false,
        });
        t.update(home, {
          invitationCode: code,
          invitationExpiresAt: expiresAt,
        });
      } else t.update(home, { invitationExpiresAt: null });
    });
    return { ok: true };
  }
  if (action === "saveLocation") {
    if (data.ownerUid !== uid)
      throw new HttpsError(
        "permission-denied",
        "Solo quien administra puede cambiar la zona del hogar.",
      );
    const location = locationSchema.parse(p);
    await home.update({
      location,
      "preferences.municipality": location.municipality,
    });
    return { ok: true };
  }

  if (action === "deleteMember") {
    const memberId = id.parse(p.memberId);
    if (data.ownerUid !== uid)
      throw new HttpsError(
        "permission-denied",
        "Solo quien administra el hogar puede eliminar perfiles.",
      );
    if (memberId === data.ownerUid)
      throw new HttpsError(
        "failed-precondition",
        "El perfil administrador debe permanecer en el hogar.",
      );
    await db.runTransaction(async (t) => {
      const memberRef = home.collection("members").doc(memberId);
      const allMembers = await t.get(home.collection("members"));
      const member = allMembers.docs.find((doc) => doc.id === memberId);
      if (!member) throw new HttpsError("not-found", "El perfil ya no existe.");
      const accountUid = member.data().accountUid;
      const userRef = accountUid
        ? db.doc(`usuarios/${id.parse(accountUid)}`)
        : null;
      const linked = userRef ? await t.get(userRef) : null;
      t.delete(memberRef);
      t.set(
        home.collection("incomePlans").doc(memberId),
        { active: false },
        { merge: true },
      );
      if (linked?.data()?.hogarId === home.id)
        t.update(userRef!, {
          hogarId: FieldValue.delete(),
          rol: FieldValue.delete(),
          personalizacionCompleta: false,
        });
      t.update(home, {
        monthlyIncome: monthlyIncome(
          allMembers.docs.filter((d) => d.id !== memberId).map((d) => d.data()),
        ),
      });
    });
    return { ok: true };
  }
  if (action === "savePreferences") {
    const locked = data.personalized
      ? {
          privacyAccepted: data.preferences.privacyAccepted,
          aiConsent: data.preferences.aiConsent,
          bankConsent: data.preferences.bankConsent,
        }
      : {};
    const parsed = preferencesSchema.parse({ ...p, ...locked });
    if (
      p.location &&
      locationSchema.parse(p.location).municipality !== parsed.municipality
    )
      throw new HttpsError(
        "invalid-argument",
        "La zona y el municipio deben coincidir.",
      );
    if (data.ownerUid !== uid)
      throw new HttpsError(
        "permission-denied",
        "Solo quien administra el hogar puede cambiar sus preferencias.",
      );
    const existing = await home.collection("members").get();
    const allowed = new Set(existing.docs.map((d) => d.id));
    const batch = db.batch();
    const { members, ...preferences } = parsed;
    for (const member of members) {
      const memberId = member.id ?? db.collection("_ids").doc().id;
      if (member.id && !allowed.has(member.id))
        throw new HttpsError("invalid-argument", "Perfil desconocido.");
      const { id: _, ...fields } = member;
      batch.set(home.collection("members").doc(memberId), fields, {
        merge: true,
      });
      batch.set(
        home.collection("incomePlans").doc(memberId),
        {
          memberId,
          amount: member.income,
          frequency: member.period,
          source: "profile",
          active: true,
        },
        { merge: true },
      );
    }
    batch.update(home, {
      ...(p.location ? { location: locationSchema.parse(p.location) } : {}),
      preferences: {
        ...preferences,
        assistantTone: "cercano",
        monthlyBudget: data.preferences?.monthlyBudget ?? 0,
      },
      monthlyIncome: monthlyIncome(members),
      personalized: true,
    });
    batch.update(db.doc(`usuarios/${uid}`), { personalizacionCompleta: true });
    await batch.commit();
    return { ok: true };
  }
  if (action === "completeMemberProfile") {
    if (!data.personalized)
      throw new HttpsError(
        "failed-precondition",
        "La persona administradora debe personalizar el hogar primero.",
      );
    if (p.privacyAccepted !== true)
      throw new HttpsError(
        "invalid-argument",
        "Acepta el aviso de privacidad.",
      );
    await db.doc(`usuarios/${uid}`).update({ personalizacionCompleta: true });
    return { ok: true };
  }
  if (!data.personalized || !user.personalizacionCompleta)
    throw new HttpsError(
      "failed-precondition",
      "Completa la personalización primero.",
    );
  if (action === "report") {
    const month = z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .parse(p.month);
    return monthReport(home, uid, month);
  }
  if (action === "saveBudget") {
    if (data.ownerUid !== uid)
      throw new HttpsError(
        "permission-denied",
        "Solo quien administra puede editar el presupuesto.",
      );
    const b = z
      .object({
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        amount: z.number().min(0).max(1000000000).multipleOf(0.01),
      })
      .parse(p);
    await home.collection("budgets").doc(b.month).set({
      amount: b.amount,
      source: "manual",
      updatedBy: uid,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  }
  if (action === "saveSavingsEntry") {
    const entry = savingsSchema.parse(p);
    if (entry.date > today())
      throw new HttpsError(
        "invalid-argument",
        "No puedes registrar ahorro futuro.",
      );
    const ref = home.collection("savingsEntries").doc(entry.requestId),
      goal = home.collection("goals").doc(entry.goalId);
    await db.runTransaction(async (t) => {
      const [existing, g] = await Promise.all([t.get(ref), t.get(goal)]);
      if (existing.exists) {
        if (existing.data()?.ownerUid !== uid)
          throw new HttpsError("permission-denied", "Registro ajeno.");
        return;
      }
      if (!g.exists) throw new HttpsError("not-found", "Meta no encontrada.");
      const saved = round(
        (g.data()?.saved ?? 0) +
          (entry.type === "withdrawal" ? -entry.amount : entry.amount),
      );
      if (saved < 0)
        throw new HttpsError(
          "failed-precondition",
          "El retiro supera lo ahorrado en esta meta.",
        );
      t.create(ref, {
        ...entry,
        source: "manual",
        verified: false,
        ownerUid: uid,
        createdAt: new Date().toISOString(),
      });
      t.update(goal, { saved, updatedAt: new Date().toISOString() });
    });
    return { ok: true };
  }
  if (action === "saveSchedule") {
    const entry = scheduleSchema.parse(p);
    if (
      entry.goalId &&
      !(await home.collection("goals").doc(entry.goalId).get()).exists
    )
      throw new HttpsError("not-found", "Meta no encontrada.");
    const ref = home
      .collection("schedules")
      .doc(entry.id ?? db.collection("_ids").doc().id);
    if (entry.id && !(await ref.get()).exists)
      throw new HttpsError("not-found", "Evento no encontrado.");
    const { id: _, ...fields } = entry;
    await ref.set(
      {
        ...fields,
        anchorDay: Number(entry.nextDate.slice(-2)),
        active: true,
        updatedBy: uid,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    return { ok: true };
  }
  if (action === "cancelSchedule") {
    const ref = home.collection("schedules").doc(id.parse(p.id));
    await ref.update({ active: false, updatedBy: uid });
    return { ok: true };
  }
  if (action === "completeSchedule") {
    const scheduleId = id.parse(p.id),
      due = dateSchema.parse(p.date),
      actual = dateSchema.parse(p.actualDate);
    if (actual > today() || due > today())
      throw new HttpsError(
        "invalid-argument",
        "Confirma el evento cuando llegue su fecha.",
      );
    const ref = home.collection("schedules").doc(scheduleId);
    const receipt = home
      .collection("scheduleCompletions")
      .doc(`${scheduleId}_${due}`);
    await db.runTransaction(async (t) => {
      const [record, done] = await Promise.all([t.get(ref), t.get(receipt)]);
      if (done.exists) return;
      const event = record.data();
      if (!event?.active || event.nextDate !== due)
        throw new HttpsError(
          "failed-precondition",
          "El evento cambió. Actualiza la agenda.",
        );
      const target =
        event.kind === "saving"
          ? home.collection("goals").doc(event.goalId)
          : null;
      const goal = target ? await t.get(target) : null;
      if (target && !goal?.exists)
        throw new HttpsError("not-found", "Meta no encontrada.");
      const common = {
        amount: event.amount,
        date: actual,
        ownerUid: uid,
        createdAt: new Date().toISOString(),
        scheduleId,
      };
      if (target) {
        t.create(home.collection("savingsEntries").doc(receipt.id), {
          ...common,
          goalId: event.goalId,
          type: "contribution",
          source: "manual",
          verified: false,
          note: event.title,
        });
        t.update(target, {
          saved: round((goal!.data()?.saved ?? 0) + event.amount),
        });
      } else
        t.create(home.collection("movements").doc(receipt.id), {
          ...common,
          type: event.kind === "income" ? "ingreso" : "gasto",
          incomeKind: "regular",
          category: event.category,
          note: event.title,
          method: "manual",
          private: false,
        });
      const next = nextOccurrence(due, event.frequency, event.anchorDay);
      t.update(ref, {
        active: !!next,
        nextDate: next ?? due,
        lastCompletedDate: actual,
      });
      t.create(receipt, { ownerUid: uid, date: actual, dueDate: due });
    });
    return { ok: true };
  }
  if (action === "saveMovement") {
    const m = movementSchema.parse(p);
    if (m.date > today())
      throw new HttpsError(
        "invalid-argument",
        "No puedes registrar un movimiento futuro.",
      );
    const ref = home.collection("movements").doc(m.requestId);
    await db.runTransaction(async (t) => {
      const exists = await t.get(ref);
      if (exists.exists) return;
      let aiMetadata = {};
      if (m.method !== "manual") {
        if (!m.draftId || m.draftIndex === undefined)
          throw new HttpsError(
            "invalid-argument",
            "Analiza el comprobante primero.",
          );
        const dr = home.collection("drafts").doc(m.draftId);
        const d = await t.get(dr);
        const draft = d.data();
        if (
          !draft ||
          draft.ownerUid !== uid ||
          draft.expiresAt.toMillis() < Date.now() ||
          !draft.movements[m.draftIndex]
        )
          throw new HttpsError(
            "permission-denied",
            "El análisis caducó o no es tuyo.",
          );
        if ((draft.used ?? []).includes(m.draftIndex))
          throw new HttpsError(
            "already-exists",
            "Este movimiento ya fue guardado.",
          );
        const sourceRef = home
          .collection("analyzedSources")
          .doc(draft.sourceHash ?? m.draftId);
        const prior = await t.get(sourceRef);
        if (
          (draft.movements[m.draftIndex].possibleDuplicate ||
            (prior.exists && prior.data()?.draftId !== m.draftId)) &&
          !m.allowDuplicate
        )
          throw new HttpsError(
            "already-exists",
            "Este comprobante podría estar duplicado. Revisa y confirma si es otro gasto.",
          );
        if (
          m.learnCategory &&
          m.note.trim() &&
          m.category !== draft.movements[m.draftIndex].category
        )
          t.set(home.collection("categoryRules").doc(ruleKey(m.note)), {
            category: m.category,
            updatedBy: uid,
            updatedAt: new Date().toISOString(),
          });
        t.set(sourceRef, {
          draftId: m.draftId,
          updatedAt: new Date().toISOString(),
        });
        aiMetadata = {
          suggestedCategory: draft.movements[m.draftIndex].category,
          categoryConfirmed: true,
          aiModel: draft.model ?? null,
        };
        t.update(dr, { used: [...(draft.used ?? []), m.draftIndex] });
      }
      t.create(ref, {
        ...m,
        ...aiMetadata,
        ownerUid: uid,
        private: false,
        createdAt: new Date().toISOString(),
      });
    });
    return { ok: true };
  }
  if (action === "history") {
    const month = z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .parse(p.month);
    const result = await rows(
      home
        .collection("movements")
        .where("date", ">=", month + "-01")
        .where("date", "<=", month + "-31")
        .orderBy("date", "desc"),
    );
    return result.filter((m: any) => !m.private || m.ownerUid === uid);
  }
  if (action === "saveGoal") {
    const g = z
      .object({
        id: id.optional(),
        name: z.string().trim().min(1).max(80),
        target: z.number().positive().max(10000000).multipleOf(0.01),
        targetDate: z.union([dateSchema, z.literal("")]).optional(),
      })
      .parse(p);
    if (g.id) {
      const ref = home.collection("goals").doc(g.id);
      if (!(await ref.get()).exists)
        throw new HttpsError("not-found", "Meta no encontrada.");
      await ref.update({
        name: g.name,
        target: g.target,
        targetDate: g.targetDate ?? "",
      });
    } else
      await home.collection("goals").add({
        name: g.name,
        target: g.target,
        saved: 0,
        targetDate: g.targetDate ?? "",
        ownerUid: uid,
        createdAt: new Date().toISOString(),
      });
    return { ok: true };
  }
  if (action === "prepareRetailerCart") {
    z.literal("heb").parse(p.retailer);
    const items = cartSchema.parse(p.items);
    const config = (await db.doc("retailerIntegrations/heb").get()).data();
    const selected = items.filter((i) => i.selected);
    const mappings = selected.length
      ? await db.getAll(
          ...selected.map((i) => db.doc(`retailerProductMappings/heb_${i.id}`)),
        )
      : [];
    return prepareHebCart(
      items,
      mappings.filter((m) => m.exists).map((m) => m.data()),
      config,
    );
  }
  if (action === "saveCart") {
    await home
      .collection("cart")
      .doc("current")
      .set({
        items: cartSchema.parse(p.items),
        updatedAt: new Date().toISOString(),
      });
    return { ok: true };
  }
  if (action === "searchProducts") {
    const term = normalize(z.string().trim().min(2).max(100).parse(p.term));
    const tokens = term.split(" ");
    const result = await rows(
      db
        .collection("catalogProducts")
        .where("searchTokens", "array-contains", tokens[0])
        .limit(100),
    );
    if (result.length)
      return result
        .filter((r: any) =>
          tokens.every((token) => r.searchName.includes(token)),
        )
        .slice(0, 20);
    return rows(
      db
        .collection("catalogProducts")
        .orderBy("searchName")
        .startAt(term)
        .endAt(term + "\uf8ff")
        .limit(20),
    );
  }
  if (action === "compareCart") {
    const items = cartSchema.parse(p.items).filter((i) => i.selected);
    if (!items.length) return [];
    const area = locationSchema.parse(
      p.area ??
        data.location ?? {
          municipality: data.preferences?.municipality,
          state: "",
          source: "manual",
        },
    );
    const historical = z.boolean().default(false).parse(p.historical);
    const sort = z.enum(["price", "distance"]).default("price").parse(p.sort);
    const stores = await catalogStores(db, area);
    // Fetch exact product/branch observations; no invented substitutes or prices.
    if (!stores.length) return [];
    const prices: any[] = [];
    for (const item of items) {
      const snapshots = await db.getAll(
        ...stores.map((store: any) =>
          db.collection("prices").doc(`${item.id}_${store.id}`),
        ),
      );
      for (const snap of snapshots) if (snap.exists) prices.push(snap.data());
    }
    return compareStores(
      items,
      stores,
      prices,
      area,
      today(),
      historical,
      sort,
    );
  }
  if (action === "markNotifications") {
    const ids = z.array(z.string().max(160)).max(100).parse(p.ids);
    await home.collection("readNotifications").doc(uid).set({ ids });
    return { ok: true };
  }
  if (
    [
      "bankAvailability",
      "bankDiscardReview",
      "bankConnectionStatus",
      "bankAuthorize",
      "bankConnect",
      "bankAccounts",
      "bankPreview",
      "bankImport",
      "bankDisconnect",
      "bankEraseImports",
    ].includes(action)
  ) {
    await rateLimit(uid, "bank", 20);
    return privateBankAction(
      uid,
      home,
      data,
      Number(token.auth_time),
      action,
      p,
      integrations.value(),
    );
  }
  throw new HttpsError("invalid-argument", "Operación desconocida.");
}
// All household access is authorized server-side; raw files never reach Firestore.
db.settings({ ignoreUndefinedProperties: true });
export const api = onCall(
  { cors: true, secrets: ["SUMMA_INTEGRATIONS"] },
  async (req) => {
    if (!req.auth)
      throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");
    try {
      const body = z
        .object({ action: z.string().max(40), payload: z.unknown().optional() })
        .parse(req.data);
      await rateLimit(req.auth.uid, "api", 90);
      return await handle(
        req.auth.uid,
        body.action,
        body.payload ?? {},
        req.auth.token,
      );
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      if (e instanceof z.ZodError)
        throw new HttpsError(
          "invalid-argument",
          "Revisa los campos del formulario.",
          e.issues.map((x) => ({ path: x.path, message: x.message })),
        );
      console.error("Summa operation failed", {
        code: (e as any)?.code ?? "unknown",
      });
      throw new HttpsError(
        "internal",
        "No pudimos completar la operación. Intenta nuevamente.",
      );
    }
  },
);
