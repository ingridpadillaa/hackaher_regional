import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const { accounts } = JSON.parse(
  await readFile(
    new URL("../../backend/.demo-hacka-v2-access.local", import.meta.url),
    "utf8",
  ),
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Correo electrónico", { exact: true })
    .fill(accounts[0].email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(accounts[0].password);
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .last()
    .click();
  await page.getByRole("link", { name: "Simulador", exact: true }).click();
  await page
    .getByRole("button", { name: "Conectar mi banco", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "no tiene BBVA real habilitado",
    { timeout: 30000 },
  );
  await page.getByLabel(/Autorizo a Syncfy/).check();
  await expect(
    page.getByRole("button", { name: "Autorizar y abrir Syncfy" }),
  ).toBeDisabled();
  await page.screenshot({
    path: "/tmp/summa-ui/bbva-unavailable.png",
    fullPage: true,
  });
  // UI fixtures only: no provider credentials, sessions or bank writes are used.
  const calls = [];
  await page.route("**/demo-summa/us-central1/api", async (route) => {
    const body = route.request().postDataJSON(),
      a = body?.data?.action;
    if (!a?.startsWith("bank")) return route.continue();
    calls.push(body.data);
    const results = {
      bankConnectionStatus: { consented: true },
      bankDiscardReview: { ok: true },
      bankAccounts: [
        {
          id: "fixture-account",
          name: "BBVA Prueba",
          last4: "1234",
          type: "Credit",
          currency: "MXN",
        },
      ],
      bankPreview: {
        draftId: "fixture-draft",
        rows: [
          {
            id: "fixture-txn",
            date: "2026-09-24",
            description: "Compra de prueba",
            amount: 150,
            direction: "cargo",
            imported: false,
            possibleDuplicate: false,
          },
        ],
        from: "2026-08-25",
        to: "2026-09-24",
        hasMore: false,
        skipped: 0,
      },
      bankImport: { imported: 1, alreadyImported: 0 },
      bankDisconnect: { ok: true },
      bankEraseImports: { deleted: 1 },
    };
    return route.fulfill({ json: { result: results[a] ?? {} } });
  });
  await page.getByLabel("Entorno bancario").selectOption("sandbox");
  await page
    .getByRole("button", { name: "Consultar cuentas disponibles" })
    .click();
  await page.getByLabel("Cuenta a revisar").selectOption("fixture-account");
  await page.getByRole("button", { name: "Revisar últimos 30 días" }).click();
  await page.getByLabel(/Compra de prueba/).check();
  await expect(
    page.getByRole("button", { name: "Importar selección de forma privada" }),
  ).toBeDisabled();
  await page.getByLabel("Cómo contar este movimiento").selectOption("gasto");
  await page
    .getByLabel("Categoría", { exact: true })
    .selectOption("Alimentación");
  await page
    .getByRole("button", { name: "Importar selección de forma privada" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "1 movimientos privados importados",
  );
  const imported = calls.find((c) => c.action === "bankImport");
  if (imported.payload.items[0].type !== "gasto")
    throw Error("Wrong selected type");
  await page.getByLabel(/Quiero revocar la conexión/).check();
  await page.getByRole("button", { name: "Desconectar mi banco" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Conexión revocada en Syncfy.",
  );
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS: actual sandbox-only gate; mocked review requires type, imports selection privately, and disconnect requires explicit choice. No real bank session opened.",
  );
} finally {
  await browser.close();
}
