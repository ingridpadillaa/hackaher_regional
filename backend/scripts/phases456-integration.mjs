import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8085";
const db = getFirestore(initializeApp({ projectId: "demo-summa" }));
async function signup() {
  const r = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `phase456-${crypto.randomUUID()}@example.test`,
        password: "test-password-123",
        returnSecureToken: true,
      }),
    },
  );
  const d = await r.json();
  assert.ok(d.idToken);
  return d;
}
async function api(u, action, payload = {}) {
  const r = await fetch("http://127.0.0.1:5001/demo-summa/us-central1/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${u.idToken}`,
    },
    body: JSON.stringify({ data: { action, payload } }),
    signal: AbortSignal.timeout(30000),
  });
  const d = await r.json();
  if (d.error)
    throw Object.assign(new Error(d.error.message), { status: d.error.status });
  return d.result;
}
const owner = await signup(),
  member = await signup(),
  outsider = await signup();
await api(owner, "bootstrap");
await api(owner, "createHome", {
  name: "Pruebas locales fases 4–6",
  members: [
    {
      name: "Test owner",
      age: 30,
      relationship: "Administrador",
      education: "",
      occupation: "",
      income: 0,
      period: "mensual",
    },
  ],
});
let s = await api(owner, "bootstrap");
await api(owner, "savePreferences", {
  municipality: "Monterrey",
  lifestyle: "",
  priorities: [],
  assistantTone: "cercano",
  aiConsent: true,
  bankConsent: false,
  privacyAccepted: true,
  alerts: true,
  goals: true,
  donations: false,
  members: s.home.members,
});
s = await api(owner, "bootstrap");
const old = s.home.invitationCode;
assert.ok(s.home.invitationExpiresAt);
assert.equal(
  (await api(member, "previewInvitation", { code: old })).name,
  s.home.name,
);
await api(owner, "rotateInvitation");
s = await api(owner, "bootstrap");
assert.notEqual(s.home.invitationCode, old);
await assert.rejects(() => api(member, "previewInvitation", { code: old }), {
  status: "NOT_FOUND",
});
await api(member, "bootstrap");
await api(member, "joinHome", { code: s.home.invitationCode });
await api(member, "completeMemberProfile", { privacyAccepted: true });
await assert.rejects(() => api(member, "rotateInvitation"), {
  status: "PERMISSION_DENIED",
});
await assert.rejects(
  () =>
    api(member, "saveLocation", {
      municipality: "Other",
      state: "",
      source: "manual",
    }),
  { status: "PERMISSION_DENIED" },
);
await assert.rejects(
  () => api(owner, "saveLocation", { municipality: "Monterrey", latitude: 25 }),
  { status: "INVALID_ARGUMENT" },
);
await api(owner, "saveLocation", {
  municipality: "Monterrey",
  state: "Nuevo León",
  latitude: 25.6866,
  longitude: -100.3161,
  source: "browser",
});
s = await api(owner, "bootstrap");
assert.equal(s.home.location.latitude, 25.6866);
await api(owner, "saveLocation", {
  municipality: "Monterrey",
  state: "Nuevo León",
  source: "manual",
});
s = await api(owner, "bootstrap");
assert.equal(s.home.location.latitude, undefined);
await api(owner, "revokeInvitation");
await assert.rejects(
  () => api(outsider, "previewInvitation", { code: s.home.invitationCode }),
  { status: "NOT_FOUND" },
);
await api(owner, "rotateInvitation");
s = await api(owner, "bootstrap");
await db
  .doc(`invitations/${s.home.invitationCode}`)
  .update({ expiresAt: "2020-01-01T00:00:00.000Z" });
await assert.rejects(
  () => api(outsider, "joinHome", { code: s.home.invitationCode }),
  { status: "NOT_FOUND" },
);
assert.equal(
  (await api(owner, "bootstrap")).home.invitationExpiresAt,
  "2020-01-01T00:00:00.000Z",
);
const home = db.doc(`hogares/${s.home.id}`),
  movement = {
    type: "gasto",
    amount: 15,
    category: "Otros",
    note: "Descripción de prueba",
    date: s.date,
  };
const draft = {
  movements: [movement],
  ownerUid: owner.localId,
  expiresAt: Timestamp.fromMillis(Date.now() + 60000),
  sourceHash: "test-source",
  model: "test-fixture",
};
await home.collection("drafts").doc("test-draft").set(draft);
const saved = {
  ...movement,
  requestId: crypto.randomUUID(),
  method: "ticket",
  draftId: "test-draft",
  draftIndex: 0,
  category: "Servicios",
  learnCategory: true,
};
await api(owner, "saveMovement", saved);
await api(owner, "saveMovement", saved);
assert.equal((await home.collection("categoryRules").get()).size, 1);
await home
  .collection("drafts")
  .doc("duplicate-draft")
  .set({ ...draft, movements: [{ ...movement, possibleDuplicate: true }] });
const duplicate = {
  ...saved,
  requestId: crypto.randomUUID(),
  draftId: "duplicate-draft",
};
await assert.rejects(() => api(owner, "saveMovement", duplicate), {
  status: "ALREADY_EXISTS",
});
await api(owner, "saveMovement", { ...duplicate, allowDuplicate: true });
await home.collection("drafts").doc("private-draft").set(draft);
await assert.rejects(
  () =>
    api(member, "saveMovement", {
      ...saved,
      requestId: crypto.randomUUID(),
      draftId: "private-draft",
    }),
  { status: "PERMISSION_DENIED" },
);
console.log(
  "PASS: invitation preview, revocation, rotation, expiry, member role, location consent data, correction rules and duplicate confirmation.",
);
const products = await db.collection("catalogProducts").limit(100).get();
assert.ok(
  products.size,
  "Carga el catálogo local con load-profeco.mjs --emulator",
);
let chosen;
for (const doc of products.docs) {
  const prices = await db
    .collection("prices")
    .where("productId", "==", doc.id)
    .get();
  if (prices.size >= 4) {
    chosen = { id: doc.id, ...doc.data() };
    break;
  }
}
assert.ok(
  chosen,
  "Se requiere un producto observado en al menos cuatro sucursales",
);
const items = [
  {
    id: chosen.id,
    name: chosen.name,
    unit: chosen.unit,
    quantity: 1,
    selected: true,
  },
];
const area = {
  municipality: "Monterrey",
  state: "Nuevo León",
  source: "manual",
};
const current = await api(owner, "compareCart", { items, area });
assert.ok(
  current.every((o) => o.total === null),
  "Observaciones julio no deben parecer precios actuales",
);
const historical = await api(owner, "compareCart", {
  items,
  area,
  historical: true,
});
assert.equal(historical.length, 4);
assert.ok(
  historical.every(
    (o) => o.total > 0 && o.historical && o.lines[0].source === "PROFECO QQP",
  ),
);
const partial = await api(owner, "compareCart", {
  items: [
    ...items,
    {
      id: "missing",
      name: "Unmatched",
      unit: "pieza",
      quantity: 1,
      selected: true,
    },
  ],
  area,
  historical: true,
});
assert.ok(partial.every((o) => o.total === null && o.missingCount === 1));
assert.ok(
  (
    await api(owner, "searchProducts", {
      term: chosen.searchName.split(" ").slice(0, 1).join(" "),
    })
  ).length,
);
console.log(
  "PASS: actual PROFECO catalog compares four branches, excludes stale prices by default and prevents partial baskets from winning.",
);
