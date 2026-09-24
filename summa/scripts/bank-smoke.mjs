// Explicit sandbox smoke test. Never run with production banking credentials.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const email = `bank-${crypto.randomUUID()}@example.test`,
  password = "test-password-123";
const r = await fetch(
  "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  },
);
const u = await r.json();
async function api(action, payload = {}) {
  const r = await fetch("http://127.0.0.1:5001/demo-summa/us-central1/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${u.idToken}`,
    },
    body: JSON.stringify({ data: { action, payload } }),
  });
  const j = await r.json();
  console.log("API check:", action, j.error?.status ?? "ok");
  if (j.error) throw new Error(j.error.message);
  return j.result;
}
await api("bootstrap");
await api("createHome", {
  name: "Bank sandbox test",
  members: [
    {
      name: "Sandbox test",
      age: 30,
      relationship: "Administrador",
      education: "Universidad",
      occupation: "Prueba",
      income: 0,
      period: "mensual",
    },
  ],
});
let s = await api("bootstrap");
await api("savePreferences", {
  municipality: "Test",
  monthlyBudget: 1000,
  lifestyle: "",
  priorities: [],
  assistantTone: "cercano",
  aiConsent: false,
  bankConsent: true,
  privacyAccepted: true,
  alerts: true,
  goals: true,
  donations: false,
  members: s.home.members,
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5173");
await page
  .getByRole("button", { name: "Iniciar sesión", exact: true })
  .first()
  .click();
await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
await page.getByLabel("Contraseña", { exact: true }).fill(password);
await page
  .getByRole("button", { name: "Iniciar sesión", exact: true })
  .last()
  .click();
await page.getByRole("link", { name: "Simulador", exact: true }).click();
await page.getByRole("button", { name: "Conectar mi banco" }).click();
await page
  .getByText("Conecta una institución de prueba desde Syncfy.", { exact: true })
  .waitFor({ timeout: 30000 })
  .catch(async (e) => {
    console.log(
      "Visible errors:",
      await page.locator(".error").allTextContents(),
    );
    console.log("Browser errors:", errors);
    await page.screenshot({
      path: "/tmp/summa-ui/09-syncfy-error.png",
      fullPage: true,
    });
    await browser.close();
    throw e;
  });
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/summa-ui/09-syncfy.png", fullPage: true });
console.log("Widget errors:", errors);
console.log((await page.locator("#syncfy-widget").innerText()).slice(0, 2000));
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "PASS: authenticated server-created sandbox session and official Syncfy widget rendered.",
);
