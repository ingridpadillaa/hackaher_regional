// Local maintenance only. Never print credential contents or access tokens.
import { GoogleAuth } from "google-auth-library";
import { initializeApp } from "firebase-admin/app";
import { Firestore } from "@google-cloud/firestore";
import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function maintenanceClient(projectId = "hackaher") {
  if (
    process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST
  )
    throw new Error(
      "This maintenance script requires cloud Firebase, not emulators.",
    );
  const dir = path.join(os.homedir(), ".config/firebase");
  const files = (await readdir(dir)).filter((f) =>
    f.endsWith("_application_default_credentials.json"),
  );
  const keyFilename =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    (files.length === 1 ? path.join(dir, files[0]) : null);
  if (!keyFilename)
    throw new Error(
      "Set GOOGLE_APPLICATION_CREDENTIALS to your authorized local credential.",
    );
  const auth = new GoogleAuth({
    keyFilename,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const app = initializeApp(
    {
      projectId,
      credential: {
        async getAccessToken() {
          const result = await client.getAccessToken();
          if (!result.token)
            throw new Error("Unable to obtain Firebase access token.");
          return { access_token: result.token, expires_in: 3500 };
        },
      },
    },
    `maintenance-${Date.now()}`,
  );
  return { db: new Firestore({ projectId, keyFilename }), app, client };
}
