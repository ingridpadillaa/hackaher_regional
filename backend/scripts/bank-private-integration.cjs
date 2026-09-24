// Local Firestore/Auth integration. All Syncfy traffic is mocked; no bank connection is opened.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8085";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const app = initializeApp({ projectId: "demo-summa" }),
  db = getFirestore(app);
const provider = require("../functions/lib/banking");
const { privateBankAction } = require("../functions/lib/bank-private");
const now = Math.floor(Date.now() / 1000),
  date = require("../functions/lib/domain").today();
const config = {
  syncfyKey: "mock",
  syncfyLiveEnabled: true,
  bankDataKey: "ab".repeat(32),
};
let deleteFails = false,
  created = 0,
  requests = [];
provider.syncfyRequest = async (path, p, method = "GET") => {
  requests.push({ path, method });
  if (path === "/catalogues/sites")
    return [{ id_site: "real-bbva", name: "BBVA Personal", is_personal: 1 }];
  if (path === "/users" && method === "GET") return [];
  if (path === "/users" && method === "POST")
    return { id_user: `external${++created}` };
  if (path === "/sessions") return { token: p.id_user };
  if (path === "/accounts")
    return [
      {
        id_account: `account-${p.token}`,
        id_site: "real-bbva",
        currency: "MXN",
        name: "Cuenta de prueba",
        number: "1234567890123456",
        account_type: "Credit",
      },
    ];
  if (path === "/transactions")
    return [
      {
        id_account: `account-${p.token}`,
        id_transaction: "transaction1",
        currency: "MXN",
        amount: -500.25,
        is_pending: 0,
        dt_transaction: Date.parse(date + "T12:00:00Z") / 1000,
        description: "Compra de prueba 1234567890123456",
      },
      {
        id_account: `account-${p.token}`,
        id_transaction: "pending",
        currency: "MXN",
        amount: -1,
        is_pending: 1,
        dt_transaction: Date.parse(date + "T12:00:00Z") / 1000,
      },
    ];
  if (path.startsWith("/users/") && method === "DELETE") {
    if (deleteFails) throw Error("Provider temporarily unavailable");
    return true;
  }
  throw Error("Unexpected provider endpoint");
};
async function signup() {
  const r = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `bank-privacy-${crypto.randomUUID()}@example.test`,
        password: "test-password-123",
        returnSecureToken: true,
      }),
    },
  );
  return r.json();
}
async function api(u, action, payload = {}) {
  const r = await fetch("http://127.0.0.1:5001/demo-summa/us-central1/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${u.idToken}`,
    },
    body: JSON.stringify({ data: { action, payload } }),
  });
  const d = await r.json();
  assert.ok(!d.error, d.error?.message);
  return d.result;
}
(async () => {
  const a = await signup(),
    b = await signup(),
    home = db.doc(`hogares/bank-private-${crypto.randomUUID()}`),
    homeData = {
      name: "Bank privacy test",
      ownerUid: a.localId,
      personalized: true,
      schemaVersion: 2,
      preferences: {
        municipality: "Monterrey",
        privacyAccepted: true,
        aiConsent: false,
        bankConsent: false,
      },
      esDemo: false,
    };
  await home.set(homeData);
  for (const u of [a, b]) {
    await db
      .doc(`usuarios/${u.localId}`)
      .set({ hogarId: home.id, personalizacionCompleta: true, nombre: "Test" });
    await home
      .collection("members")
      .doc(u.localId)
      .set({
        accountUid: u.localId,
        name: "Test",
        income: 0,
        period: "mensual",
      });
  }
  const call = (u, action, p = {}) =>
    privateBankAction(
      u.localId,
      home,
      homeData,
      now,
      action,
      { mode: "live", ...p },
      config,
    );
  await assert.rejects(
    privateBankAction(
      a.localId,
      home,
      homeData,
      now - 901,
      "bankAuthorize",
      { mode: "live", accept: true },
      config,
    ),
    /cierra sesión/,
  );
  await assert.rejects(
    privateBankAction(
      a.localId,
      home,
      { ...homeData, esDemo: true },
      now,
      "bankAuthorize",
      { mode: "live", accept: true },
      config,
    ),
    /demostración/,
  );
  await assert.rejects(call(a, "bankAccounts"), /Autoriza primero/);
  await call(a, "bankAuthorize", { accept: true });
  await call(b, "bankAuthorize", { accept: true });
  const accounts = await call(a, "bankAccounts");
  assert.equal(accounts[0].last4, "3456");
  assert.equal(accounts[0].number, undefined);
  await assert.rejects(
    call(b, "bankPreview", { accountId: accounts[0].id }),
    /cuenta propia/,
  );
  const preview = await call(a, "bankPreview", { accountId: accounts[0].id });
  assert.equal(preview.rows.length, 1);
  assert.equal(preview.skipped, 1);
  const draftRef = db.doc(
    `privateBankConnections/${a.localId}/modes/live/bankReviewDrafts/current`,
  );
  const stored = (await draftRef.get()).data();
  assert.ok(stored.sealed);
  assert.equal(JSON.stringify(stored).includes("Compra de prueba"), false);
  const input = {
    draftId: preview.draftId,
    items: [
      { id: preview.rows[0].id, type: "gasto", category: "Alimentación" },
    ],
  };
  await assert.rejects(call(b, "bankImport", input), /venció/);
  await assert.rejects(
    call(a, "bankImport", {
      ...input,
      items: [{ ...input.items[0], id: "forged" }],
    }),
    /fuera de la revisión/,
  );
  assert.equal((await call(a, "bankImport", input)).imported, 1);
  assert.equal((await call(a, "bankImport", input)).alreadyImported, 1);
  const rows = await home.collection("movements").get();
  assert.equal(rows.size, 1);
  assert.equal(rows.docs[0].data().private, true);
  const own = await api(a, "report", { month: date.slice(0, 7) }),
    other = await api(b, "report", { month: date.slice(0, 7) });
  assert.equal(own.summary.expenses, 500.25);
  assert.equal(other.summary.expenses, 0);
  assert.equal(other.movements.length, 0);
  const again = await call(a, "bankPreview", { accountId: accounts[0].id });
  await draftRef.update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
  await assert.rejects(
    call(a, "bankImport", { ...input, draftId: again.draftId }),
    /venció/,
  );
  assert.equal((await call(b, "bankEraseImports")).deleted, 0);
  deleteFails = true;
  await assert.rejects(call(a, "bankDisconnect"));
  await assert.rejects(call(a, "bankAccounts"), /Autoriza primero/);
  assert.equal((await draftRef.get()).exists, false);
  deleteFails = false;
  await call(a, "bankDisconnect");
  assert.equal((await call(a, "bankConnectionStatus")).consented, false);
  assert.equal((await call(a, "bankEraseImports")).deleted, 1);
  assert.equal((await home.collection("movements").get()).size, 0);
  assert.ok(!requests.some((r) => /pulls|payments|transfers/.test(r.path)));
  console.log(
    "PASS: consent, recent login, demo guard, encrypted expiry, forged account/draft denial, idempotent private import, household isolation, revocation failure/retry and personal deletion.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => deleteApp(app));
