// Uses the existing local Firebase OAuth credential, never prints tokens or keys.
import { GoogleAuth } from "google-auth-library";
import os from "node:os";
import { readdir } from "node:fs/promises";
const dir = os.homedir() + "/.config/firebase";
const files = (await readdir(dir)).filter((x) =>
  x.endsWith("_application_default_credentials.json"),
);
const credentials =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  (files.length === 1 ? dir + "/" + files[0] : undefined);
if (!credentials) throw new Error("Set GOOGLE_APPLICATION_CREDENTIALS.");
const auth = new GoogleAuth({
  keyFilename: credentials,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});
const client = await auth.getClient();
const project = "hackaher";
const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
try {
  const { data } = await client.request({ url });
  console.log(
    JSON.stringify({
      authorizedDomains: data.authorizedDomains,
      emailPasswordEnabled: data.signIn?.email?.enabled,
      anonymousEnabled: data.signIn?.anonymous?.enabled,
    }),
  );
} catch (e) {
  console.log(
    "Firebase Auth inspection:",
    e.code,
    e.response?.data?.error?.message,
  );
  process.exitCode = 1;
}
