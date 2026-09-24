// Private values are read from a local file and never printed.
import { readFile, readdir } from "node:fs/promises";
import { GoogleAuth } from "google-auth-library";
import os from "node:os";
import path from "node:path";
const dir = path.join(os.homedir(), ".config/firebase");
const files = (await readdir(dir)).filter((x) =>
  x.endsWith("_application_default_credentials.json"),
);
const keyFilename =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  (files.length === 1 ? path.join(dir, files[0]) : null);
if (!keyFilename)
  throw new Error("Set GOOGLE_APPLICATION_CREDENTIALS to your local ADC file.");
const client = await new GoogleAuth({
  keyFilename,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
}).getClient();
const values = JSON.parse(await readFile(process.argv[2], "utf8"));
const mode = process.argv[3] || "probe";
if (mode === "probe") {
  const url = new URL("https://opendata-api.syncfy.com/v1/users");
  url.searchParams.set("api_key", values.syncfyKey);
  url.searchParams.set("limit", "1");
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    console.log(
      JSON.stringify({
        provider: "syncfy",
        http: r.status,
        code: j.code,
        authorized: j.status === true,
      }),
    );
  } catch {
    console.log("Syncfy connection failed (details withheld).");
    process.exitCode = 1;
  }
} else if (mode === "enable") {
  await client.request({
    url: "https://serviceusage.googleapis.com/v1/projects/698201316760/services/secretmanager.googleapis.com:enable",
    method: "POST",
    data: {},
  });
  console.log("Secret Manager enablement requested.");
} else if (mode === "store") {
  const parent = "projects/hackaher";
  const name = parent + "/secrets/SUMMA_INTEGRATIONS";
  try {
    await client.request({
      url: `https://secretmanager.googleapis.com/v1/${name}`,
    });
  } catch (e) {
    if (e.response?.status !== 404) {
      console.log(
        "Secret Manager unavailable:",
        e.response?.status,
        e.response?.data?.error?.status,
        e.response?.data?.error?.message,
      );
      process.exit(1);
    }
    await client.request({
      url: `https://secretmanager.googleapis.com/v1/${parent}/secrets?secretId=SUMMA_INTEGRATIONS`,
      method: "POST",
      data: { replication: { automatic: {} } },
    });
  }
  await client.request({
    url: `https://secretmanager.googleapis.com/v1/${name}:addVersion`,
    method: "POST",
    data: {
      payload: { data: Buffer.from(JSON.stringify(values)).toString("base64") },
    },
  });
  console.log("SUMMA_INTEGRATIONS stored; secret values omitted.");
}
