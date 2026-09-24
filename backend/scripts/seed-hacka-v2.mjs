// Phase 7 is isolated to local emulators. No cloud credentials or cloud writes.
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { buildDataset, people, seedTag, homeId } from "./hacka-dataset.mjs";
const args = process.argv.slice(2),
  apply = args.includes("--apply");
const end = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Monterrey",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
if (apply && !args.includes("--confirm-demo"))
  throw Error("La carga requiere --apply --confirm-demo.");
let catalog;
try {
  catalog = JSON.parse(
    await readFile(
      new URL("../data/profeco-catalog.json", import.meta.url),
      "utf8",
    ),
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
// Use only products with real observations in at least four actual branches.
const coverage = new Map();
for (const p of catalog?.prices ?? []) {
  const ids = coverage.get(p.productId) ?? new Set();
  ids.add(p.storeId);
  coverage.set(p.productId, ids);
}
const products = (catalog?.products ?? [])
  .filter((p) => (coverage.get(p.id)?.size ?? 0) >= 4)
  .slice(0, 4);
const dataset = buildDataset(end, products);
console.log(JSON.stringify(dataset.manifest, null, 2));
if (!apply) {
  console.log("Solo vista previa. Carga local: --apply --confirm-demo");
  process.exit(0);
}
if (products.length < 4)
  throw Error(
    "Primero normaliza el catálogo real PROFECO: faltan cuatro productos comparables.",
  );
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8085";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const app = initializeApp({ projectId: "demo-summa" }, "hacka-v2");
try {
  const db = getFirestore(app),
    auth = getAuth(app),
    home = db.doc(`hogares/${homeId}`);
  const current = await home.get();
  if (current.exists) {
    if (current.data().seedTag !== seedTag || current.data().esDemo !== true)
      throw Error("El destino no es la demo esperada.");
    console.log(
      "La demo ya existe; se conserva íntegra, sin sobrescribir ni duplicar.",
    );
  } else {
    for (const p of products)
      if (!(await db.doc(`catalogProducts/${p.id}`).get()).exists)
        throw Error("Carga primero PROFECO en el emulador.");
    const accessPath = new URL(
      "../.demo-hacka-v2-access.local",
      import.meta.url,
    );
    let access;
    try {
      access = JSON.parse(await readFile(accessPath, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      access = {
        project: "demo-summa",
        homeId,
        accounts: people.map((p) => ({
          uid: p.uid,
          email: p.email,
          password: randomBytes(24).toString("base64url"),
        })),
      };
    }
    if (access.project !== "demo-summa" || access.homeId !== homeId)
      throw Error("Archivo de acceso de otro entorno.");
    // Validate all account ownership before any write, including recovery after interruption.
    for (const p of people) {
      const record = await auth.getUser(p.uid).catch((e) => {
        if (e.code === "auth/user-not-found") return null;
        throw e;
      });
      const u = await db.doc(`usuarios/${p.uid}`).get();
      if (record && record.email !== p.email)
        throw Error("Cuenta ajena a esta demo.");
      if (
        u.exists &&
        (u.data().hogarId !== homeId || u.data().seedTag !== seedTag)
      )
        throw Error("Perfil ajeno a esta demo.");
      if (
        !access.accounts.some(
          (a) => a.uid === p.uid && a.email === p.email && a.password,
        )
      )
        throw Error("Acceso incompleto.");
    }
    await writeFile(accessPath, JSON.stringify(access, null, 2) + "\n", {
      mode: 0o600,
    });
    await chmod(accessPath, 0o600);
    for (const p of people) {
      const a = access.accounts.find((a) => a.uid === p.uid);
      const exists = await auth.getUser(p.uid).catch((e) => {
        if (e.code === "auth/user-not-found") return null;
        throw e;
      });
      if (!exists) await auth.createUser({ ...a, displayName: p.name });
    }
    const invitationCode = randomBytes(16).toString("hex").toUpperCase(),
      now = new Date().toISOString(),
      expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const batch = db.batch();
    batch.create(home, {
      name: "Hacka",
      ownerUid: people[0].uid,
      esDemo: true,
      seedTag,
      schemaVersion: 2,
      currency: "MXN",
      timezone: "America/Monterrey",
      personalized: true,
      monthlyIncome: 27000,
      invitationCode,
      invitationExpiresAt: expiresAt,
      createdAt: now,
      demoPeriod: { start: dataset.manifest.start, end },
      location: {
        municipality: "Monterrey",
        state: "Nuevo León",
        source: "manual",
      },
      preferences: {
        municipality: "Monterrey",
        monthlyBudget: 18000,
        lifestyle: "",
        priorities: [],
        assistantTone: "cercano",
        privacyAccepted: true,
        aiConsent: true,
        bankConsent: false,
        alerts: true,
        goals: true,
        donations: false,
      },
    });
    for (const p of people)
      batch.create(db.doc(`usuarios/${p.uid}`), {
        nombre: p.name,
        email: p.email,
        hogarId: homeId,
        rol: p.uid === people[0].uid ? "admin" : "integrante",
        personalizacionCompleta: true,
        esDemo: true,
        seedTag,
        creadoEn: now,
      });
    batch.create(db.doc(`invitations/${invitationCode}`), {
      homeId,
      createdBy: people[0].uid,
      expiresAt,
      revoked: false,
      esDemo: true,
      seedTag,
    });
    for (const d of dataset.docs) batch.create(db.doc(d.path), d.data);
    if (dataset.docs.length + 4 > 500)
      throw Error("La carga excede el lote atómico permitido.");
    await batch.commit();
    await writeFile(
      new URL("../data/hacka-v2-manifest.json", import.meta.url),
      JSON.stringify(dataset.manifest, null, 2) + "\n",
    );
    console.log(
      "Demo Hacka creada únicamente en demo-summa. Accesos: backend/.demo-hacka-v2-access.local. Sin despliegue.",
    );
  }
} finally {
  await deleteApp(app);
}
