// Copy only the marked cloud demo to local emulators; never deploy or modify cloud data.
import { maintenanceClient } from "./firebase-admin-local.mjs";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFile } from "node:fs/promises";
const { db: cloud } = await maintenanceClient();
const home = await cloud.doc("hogares/demo-hack").get();
if (
  !home.exists ||
  home.data().esDemo !== true ||
  home.data().seedTag !== "hack-three-months-v1"
)
  throw new Error("Verified demo household required.");
const documents = [{ path: home.ref.path, data: home.data() }];
for (const collection of [
  "members",
  "movements",
  "goals",
  "cart",
  "notifications",
]) {
  const snapshot = await home.ref.collection(collection).get();
  for (const doc of snapshot.docs)
    documents.push({ path: doc.ref.path, data: doc.data() });
}
for (const uid of ["demo-hack-rosy", "demo-hack-vane"]) {
  const doc = await cloud.doc(`usuarios/${uid}`).get();
  if (doc.data()?.hogarId !== home.id || doc.data()?.esDemo !== true)
    throw new Error("Unexpected demo account.");
  documents.push({ path: doc.ref.path, data: doc.data() });
}
const invitation = await cloud
  .doc(`invitations/${home.data().invitationCode}`)
  .get();
documents.push({ path: invitation.ref.path, data: invitation.data() });
const access = JSON.parse(
  await readFile(
    new URL("../.demo-hack-access.local", import.meta.url),
    "utf8",
  ),
);
// Emulator-only hosts are explicit; no cloud writes below this line.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8085";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const localApp = initializeApp({ projectId: "demo-summa" }, "demo-mirror");
const local = getFirestore(localApp);
const existing = await local.doc(home.ref.path).get();
if (existing.exists) {
  if (existing.data()?.esDemo !== true)
    throw new Error("Refusing to replace a non-demo household.");
  console.log("Local demo already exists; leaving it unchanged.");
  process.exit(0);
}
const auth = getAuth(localApp);
for (const account of access.accounts) {
  try {
    await auth.getUser(account.uid);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
    await auth.createUser({
      uid: account.uid,
      email: account.email,
      password: account.password,
      displayName: account.uid.endsWith("rosy") ? "Rosy" : "Vane",
    });
  }
}
const batch = local.batch();
for (const doc of documents) batch.set(local.doc(doc.path), doc.data);
await batch.commit();
console.log(
  JSON.stringify({
    project: "demo-summa",
    cloudSource: "hackaher",
    home: "Hack",
    copiedDocuments: documents.length,
    cloudWrites: 0,
  }),
);
