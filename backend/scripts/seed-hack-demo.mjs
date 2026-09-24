// Explicit demo-only seed. Never modifies a real household or creates market prices.
import { maintenanceClient } from "./firebase-admin-local.mjs";
import { getAuth } from "firebase-admin/auth";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const project = "hackaher";
const homeId = "demo-hack";
const seedTag = "hack-three-months-v1";
const apply = process.argv.includes("--apply");
const end = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Monterrey",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const start = new Date(`${end}T12:00:00Z`);
start.setUTCDate(1);
start.setUTCMonth(start.getUTCMonth() - 2);
const dates = [];
for (
  let day = new Date(start);
  day.toISOString().slice(0, 10) <= end;
  day.setUTCDate(day.getUTCDate() + 1)
)
  dates.push(day.toISOString().slice(0, 10));
const people = [
  {
    uid: "demo-hack-rosy",
    name: "Rosy",
    email: "rosy.hack.demo@example.test",
    age: 25,
    income: 15000,
    relationship: "Administrador",
    occupation: "Empleada",
  },
  {
    uid: "demo-hack-vane",
    name: "Vane",
    email: "vane.hack.demo@example.test",
    age: 26,
    income: 12000,
    relationship: "Adulto",
    occupation: "Empleada",
  },
];
const movements = [];
const add = (date, person, category, amount, note, type = "gasto") =>
  movements.push({
    id: `demo-${date}-${person.uid}-${movements.length}`,
    type,
    amount,
    category,
    note,
    date,
    method: "manual",
    ownerUid: person.uid,
    integranteId: person.uid,
    private: false,
    esPrueba: true,
    seedTag,
    createdAt: `${date}T18:00:00.000Z`,
  });
for (let i = 0; i < dates.length; i++) {
  const date = dates[i],
    day = Number(date.slice(-2)),
    person = people[i % 2];
  if (day === 1) add(date, people[0], "Vivienda", 6500, "Renta compartida");
  if (day === 5) add(date, people[1], "Servicios", 1250, "Servicios del hogar");
  if (day === 12) add(date, people[0], "Salud", 460, "Consulta y farmacia");
  if (day === 18) add(date, people[1], "Educación", 700, "Curso");
  if (i % 7 === 0)
    add(date, person, "Alimentación", 850 + (i % 5) * 35, "Despensa del hogar");
  if (i % 3 === 0)
    add(date, person, "Transporte", 95 + (i % 4) * 10, "Traslados");
  if (i % 5 === 0)
    add(date, person, "Alimentación", 180 + (i % 3) * 20, "Comida fuera");
  if (day === 22)
    add(date, person, "Recreación", 380, "Salida de fin de semana");
  if (day === 15)
    add(date, people[1], "Otros", 600, "Ingreso extra ocasional", "ingreso");
}
const totals = {};
for (const m of movements) {
  const month = m.date.slice(0, 7);
  totals[month] ??= { expenses: 0, extraIncome: 0 };
  totals[month][m.type === "gasto" ? "expenses" : "extraIncome"] += m.amount;
}
const manifest = {
  project,
  homeId,
  home: "Hack",
  seedTag,
  start: dates[0],
  end,
  profiles: people.map((p) => p.name),
  monthlyHouseholdIncome: 27000,
  movements: movements.length,
  months: totals,
  demo: true,
};
console.log(JSON.stringify(manifest, null, 2));
if (!apply) {
  console.log(
    "Preview only. Use --apply --confirm-demo to write this demo dataset.",
  );
  process.exit(0);
}
if (!process.argv.includes("--confirm-demo"))
  throw new Error("Explicit --confirm-demo is required.");
const { db, app } = await maintenanceClient(project);
const auth = getAuth(app),
  home = db.doc(`hogares/${homeId}`);
const existing = await home.get();
if (
  existing.exists &&
  (existing.data().seedTag !== seedTag || existing.data().esDemo !== true)
)
  throw new Error("Refusing to overwrite a non-demo household.");
const accessPath = fileURLToPath(
  new URL("../.demo-hack-access.local", import.meta.url),
);
let access;
let accessCreated = false;
try {
  access = JSON.parse(await readFile(accessPath, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  accessCreated = true;
  access = {
    project,
    home: "Hack",
    accounts: people.map((p) => ({
      uid: p.uid,
      email: p.email,
      password: randomBytes(24).toString("base64url"),
    })),
  };
}
// Persist generated credentials before account creation so interrupted runs can recover.
await writeFile(accessPath, JSON.stringify(access, null, 2) + "\n", {
  mode: 0o600,
});
async function ensureDemoAccounts(resetPasswords = false) {
  for (const person of people) {
    let user;
    try {
      user = await auth.getUser(person.uid);
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
    }
    if (user && user.email !== person.email)
      throw new Error("Refusing to reuse another user's account.");
    const profile = await db.doc(`usuarios/${person.uid}`).get();
    if (
      profile.exists &&
      profile.data().hogarId &&
      profile.data().hogarId !== homeId
    )
      throw new Error("Demo account belongs to another household.");
    const password = access.accounts.find((a) => a.uid === person.uid).password;
    if (!user)
      await auth.createUser({
        uid: person.uid,
        email: person.email,
        password,
        displayName: person.name,
        emailVerified: false,
      });
    else if (resetPasswords) await auth.updateUser(person.uid, { password });
  }
}
await ensureDemoAccounts(accessCreated);
async function cleanVisibleLabels() {
  const labelBatch = db.batch();
  labelBatch.update(home, {
    "preferences.lifestyle":
      "Compartir gastos, cocinar en casa y usar transporte público.",
  });
  for (const person of people)
    labelBatch.update(home.collection("members").doc(person.uid), {
      occupation: "Empleada",
    });
  labelBatch.set(
    home.collection("goals").doc("demo-emergency"),
    { name: "Fondo de emergencia" },
    { merge: true },
  );
  labelBatch.set(
    home.collection("goals").doc("demo-trip"),
    { name: "Viaje compartido" },
    { merge: true },
  );
  labelBatch.set(
    home.collection("cart").doc("current"),
    {
      items: [
        {
          id: "b91dc0cfc5082f945d4ff949810b5b8b",
          name: "Arroz · Schettino · Bolsa 900 Gr. Super Extra. Verde",
          quantity: 2,
          unit: "Bolsa 900 Gr.",
          selected: true,
        },
        {
          id: "d28c7a88105d59e95714e68e85749e6e",
          name: "Leche Ultrapasteurizada · Lala · Caja 1 Lt. Entera",
          quantity: 2,
          unit: "Caja 1 Lt.",
          selected: true,
        },
      ],
    },
    { merge: true },
  );
  labelBatch.delete(home.collection("notifications").doc("demo-welcome"));
  const existingMovements = await home
    .collection("movements")
    .where("seedTag", "==", seedTag)
    .get();
  for (const movement of existingMovements.docs) {
    const note = String(movement.data().note ?? "")
      .replace(/\s*·\s*Demostración\s*$/i, "")
      .trim();
    labelBatch.update(movement.ref, { note });
  }
  await labelBatch.commit();
  return existingMovements.size;
}
if (existing.exists) {
  const cleanedMovements = await cleanVisibleLabels();
  const count = (await home.collection("movements").count().get()).data().count;
  console.log(
    JSON.stringify({
      alreadySeeded: true,
      homeId,
      movements: count,
      accessRecovered: accessCreated,
      cleanedMovements,
    }),
  );
  process.exit(0);
}
const invitationCode = randomBytes(8).toString("hex").toUpperCase();
const batch = db.batch();
batch.create(home, {
  name: "Hack",
  ownerUid: people[0].uid,
  invitationCode,
  personalized: true,
  monthlyIncome: 27000,
  esDemo: true,
  seedTag,
  demoPeriod: { start: dates[0], end },
  createdAt: new Date().toISOString(),
  preferences: {
    municipality: "Monterrey",
    monthlyBudget: 27000,
    lifestyle: "Compartir gastos, cocinar en casa y usar transporte público.",
    priorities: ["Fondo de emergencia", "Viaje"],
    assistantTone: "cercano",
    aiConsent: true,
    bankConsent: false,
    privacyAccepted: true,
    alerts: true,
    goals: true,
    donations: false,
  },
});
for (const person of people) {
  const { uid, email, ...member } = person;
  batch.create(home.collection("members").doc(uid), {
    ...member,
    education: "Universidad",
    period: "mensual",
    accountUid: uid,
    esPrueba: true,
    seedTag,
  });
  batch.set(db.doc(`usuarios/${uid}`), {
    nombre: person.name,
    email,
    hogarId: homeId,
    rol: uid === people[0].uid ? "admin" : "integrante",
    personalizacionCompleta: true,
    esDemo: true,
    seedTag,
  });
}
batch.create(db.doc(`invitations/${invitationCode}`), {
  homeId,
  createdBy: people[0].uid,
  esDemo: true,
  seedTag,
});
for (const { id, ...movement } of movements)
  batch.create(home.collection("movements").doc(id), movement);
batch.create(home.collection("goals").doc("demo-emergency"), {
  name: "Fondo de emergencia",
  target: 18000,
  saved: 3600,
  esPrueba: true,
  seedTag,
  savingsSource: "demo",
  createdAt: new Date().toISOString(),
});
batch.create(home.collection("goals").doc("demo-trip"), {
  name: "Viaje compartido",
  target: 12000,
  saved: 1200,
  esPrueba: true,
  seedTag,
  savingsSource: "demo",
  createdAt: new Date().toISOString(),
});
batch.create(home.collection("cart").doc("current"), {
  items: [
    {
      id: "b91dc0cfc5082f945d4ff949810b5b8b",
      name: "Arroz · Schettino · Bolsa 900 Gr. Super Extra. Verde",
      quantity: 2,
      unit: "Bolsa 900 Gr.",
      selected: true,
    },
    {
      id: "d28c7a88105d59e95714e68e85749e6e",
      name: "Leche Ultrapasteurizada · Lala · Caja 1 Lt. Entera",
      quantity: 2,
      unit: "Caja 1 Lt.",
      selected: true,
    },
  ],
  esPrueba: true,
  seedTag,
});
await batch.commit();
const actual = await home.collection("movements").get();
if (actual.size !== movements.length)
  throw new Error("Unexpected movement count after seed.");
await writeFile(
  new URL("../../docs/DEMO_HACK_RESUMEN.md", import.meta.url),
  `# Hogar Hack · demostración\n\nProyecto Firebase: ${project}. Hogar: ${homeId}.\n\nDatos ficticios autorizados para la demo, del ${dates[0]} al ${end}. Perfiles: Rosy y Vane. ${movements.length} movimientos, 2 metas, carrito sin precios inventados. Ingreso mensual agregado: $27,000 MXN (capturado en perfiles, no duplicado como movimientos).\n\nLos accesos están únicamente en backend/.demo-hack-access.local, excluido de Git. No se enviaron correos.\n\nTotales de control:\n\n\`\`\`json\n${JSON.stringify(totals, null, 2)}\n\`\`\`\n\nLa carga en Firestore no despliega Hosting ni Functions. El modo demo-summa local usa otra base; no muestra automáticamente estos datos de la nube.\n`,
);
console.log(
  JSON.stringify({
    verified: true,
    homeId,
    movements: actual.size,
    accessFile: accessPath,
    deployed: false,
  }),
);
