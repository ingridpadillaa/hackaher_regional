import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createRequire } from "node:module";
import { maintenanceClient } from "./firebase-admin-local.mjs";
const require = createRequire(import.meta.url);
const args = process.argv.slice(2),
  get = (k) => args[args.indexOf(k) + 1];
if (!args.includes("--file"))
  throw new Error(
    "Usa --file catalogo.json. Por defecto solo valida; --emulator escribe en demo-summa.",
  );
const catalog = JSON.parse(await readFile(get("--file"), "utf8"));
for (const collection of ["products", "stores", "prices"]) {
  if (!Array.isArray(catalog[collection]))
    throw new Error("Catálogo incompleto");
  for (const row of catalog[collection])
    if (!/^[a-f0-9_]{32,65}$/.test(row.id)) throw new Error("ID no válido");
}
console.log(
  Object.fromEntries(
    ["products", "stores", "prices"].map((k) => [k, catalog[k].length]),
  ),
);
const emulator = args.includes("--emulator");
const production = args.includes("--production");
if (!emulator && !production) {
  console.log("Validación completada. No se escribió ninguna base.");
  process.exit(0);
}
if (emulator && production)
  throw new Error("Elige solo --emulator o --production.");
let db;
let cliAccessToken;
let productionProject;
if (production) {
  const project = get("--project");
  productionProject = project;
  if (project !== "hackaher" || !args.includes("--confirm-production"))
    throw new Error(
      "Producción requiere --project hackaher --confirm-production.",
    );
  if (args.includes("--firebase-cli")) {
    // Local maintenance fallback: reuse an authenticated Firebase CLI session
    // without printing or persisting its OAuth tokens in this repository.
    const { configstore } = require("firebase-tools/lib/configstore");
    const apiv2 = require("firebase-tools/lib/apiv2");
    const refreshToken = configstore.get("tokens")?.refresh_token;
    if (!refreshToken)
      throw new Error("Inicia sesión con firebase login --reauth.");
    apiv2.setRefreshToken(refreshToken);
    cliAccessToken = await apiv2.getAccessToken();
  } else ({ db } = await maintenanceClient(project));
} else {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8085";
  db = getFirestore(initializeApp({ projectId: "demo-summa" }));
}
function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number")
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  if (Array.isArray(value))
    return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "object") return { mapValue: { fields: firestoreFields(value) } };
  throw new Error("Tipo no compatible con Firestore");
}
function firestoreFields(data) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, firestoreValue(value)]),
  );
}
async function commitWithCli(collection, documents) {
  const parent = `projects/${productionProject}/databases/(default)/documents`;
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${productionProject}/databases/(default)/documents:commit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cliAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        writes: documents.map(({ id, ...data }) => ({
          update: {
            name: `${parent}/${collection}/${id}`,
            fields: firestoreFields(data),
          },
        })),
      }),
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!response.ok)
    throw new Error(`Firestore rechazó el lote (${response.status}).`);
}
for (const [input, collection] of [
  ["products", "catalogProducts"],
  ["stores", "stores"],
  ["prices", "prices"],
]) {
  for (let start = 0; start < catalog[input].length; start += 400) {
    const slice = catalog[input].slice(start, start + 400);
    if (cliAccessToken) await commitWithCli(collection, slice);
    else {
      const batch = db.batch();
      for (const { id, ...data } of slice)
        batch.set(db.collection(collection).doc(id), data);
      await batch.commit();
    }
  }
  console.log("Importado", collection);
}
const metadata = {
  id: "profeco",
  ...catalog.metadata,
  importedAt: new Date().toISOString(),
};
if (cliAccessToken) await commitWithCli("catalogImports", [metadata]);
else {
  const { id, ...data } = metadata;
  await db.doc(`catalogImports/${id}`).set(data);
}
console.log(
  production
    ? "Catálogo PROFECO real cargado en hackaher."
    : "Catálogo real cargado solo en emulador demo-summa.",
);
