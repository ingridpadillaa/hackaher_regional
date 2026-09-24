import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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
if (!args.includes("--emulator")) {
  console.log("Validación completada. No se escribió ninguna base.");
  process.exit(0);
}
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8085";
const db = getFirestore(initializeApp({ projectId: "demo-summa" }));
for (const [input, collection] of [
  ["products", "catalogProducts"],
  ["stores", "stores"],
  ["prices", "prices"],
]) {
  for (let start = 0; start < catalog[input].length; start += 400) {
    const batch = db.batch();
    for (const { id, ...data } of catalog[input].slice(start, start + 400))
      batch.set(db.collection(collection).doc(id), data);
    await batch.commit();
  }
  console.log("Importado", collection);
}
await db
  .doc("catalogImports/profeco")
  .set({ ...catalog.metadata, importedAt: new Date().toISOString() });
console.log("Catálogo real cargado solo en emulador demo-summa.");
