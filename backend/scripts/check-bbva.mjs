// Read-only provider readiness check; never prints credentials or fetches bank accounts.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { bankAvailability } = require("../functions/lib/bank-private");
const text = await readFile(
  new URL("../functions/.secret.local", import.meta.url),
  "utf8",
);
const line = text.split("\n").find((l) => l.startsWith("SUMMA_INTEGRATIONS="));
if (!line) throw Error("Falta SUMMA_INTEGRATIONS local.");
const config = JSON.parse(line.slice("SUMMA_INTEGRATIONS=".length));
try {
  const result = await bankAvailability(config);
  console.log(
    JSON.stringify(
      {
        provider: "Syncfy",
        bank: "BBVA Personal",
        liveAvailable: result.live.length > 0,
        liveEnabled: result.liveEnabled,
        liveSites: result.live.map((s) => s.name),
        sandboxSites: result.sandbox.map((s) => s.name),
        draftProtectionConfigured: !!config.bankDataKey,
      },
      null,
      2,
    ),
  );
  if (!result.live.length)
    console.log(
      "Pendiente: habilitación del conector BBVA Personal de producción para esta clave con Syncfy. Los IDs sandbox no habilitan cuentas reales.",
    );
} catch {
  console.error(
    "No se pudo comprobar la disponibilidad. No se mostraron credenciales ni respuestas privadas.",
  );
  process.exitCode = 1;
}
