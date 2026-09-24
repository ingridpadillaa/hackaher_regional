// Explicit Gemini integration against local emulators with a synthetic disposable household.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const email = `gemini-${crypto.randomUUID()}@example.test`,
  password = "synthetic-test-password-123";
const sign = await fetch(
  "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  },
);
const user = await sign.json();
assert.ok(user.idToken);
async function api(action, payload = {}) {
  const r = await fetch("http://127.0.0.1:5001/demo-summa/us-central1/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${user.idToken}`,
    },
    body: JSON.stringify({ data: { action, payload } }),
  });
  const j = await r.json();
  if (j.error) throw Error(j.error.message);
  return j.result;
}
await api("bootstrap");
await api("createHome", {
  name: "Gemini smoke test",
  members: [
    {
      name: "Prueba IA",
      age: 30,
      relationship: "Administrador",
      education: "Universidad",
      occupation: "Prueba",
      income: 1000,
      period: "mensual",
    },
  ],
});
let state = await api("bootstrap");
await api("savePreferences", {
  municipality: "Municipio de prueba",
  lifestyle: "",
  priorities: [],
  assistantTone: "cercano",
  aiConsent: true,
  bankConsent: false,
  privacyAccepted: true,
  alerts: true,
  goals: true,
  donations: false,
  members: state.home.members,
});
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .first()
    .click();
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .last()
    .click();
  await page.getByRole("heading", { name: "Presupuesto del hogar" }).waitFor();
  await page.getByRole("button", { name: /Registra movimiento/ }).click();
  await page.getByRole("button", { name: "Ticket", exact: true }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles("/tmp/summa-gemini-receipt.png");
  await page
    .getByRole("button", { name: "Analizar comprobante", exact: true })
    .click();
  const category = page.getByLabel("Categoría sugerida del movimiento 1");
  await category.waitFor();
  assert.equal(await category.inputValue(), "Transporte");
  assert.equal(
    (await api("bootstrap")).movements.length,
    0,
    "Analysis must not automatically save",
  );
  await category.selectOption("Otros");
  await page.screenshot({
    path: "/tmp/summa-ui/gemini-confirmation.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Guardar movimiento", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Registrar movimiento", exact: true })
    .waitFor({ state: "hidden" });
  state = await api("bootstrap");
  assert.equal(state.movements.length, 1);
  assert.equal(state.movements[0].category, "Otros");
  assert.equal(state.movements[0].amount, 123.45);
  await page
    .getByRole("button", { name: "Abrir chat de Jami", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Mensaje para Jami" })
    .fill("¿Cómo puedo organizar mis gastos?");
  await page
    .getByRole("button", { name: "Enviar mensaje", exact: true })
    .click();
  await page
    .getByText("Datos calculados por Summa · orientación de Gemini", {
      exact: true,
    })
    .waitFor();
  await page.screenshot({
    path: "/tmp/summa-ui/gemini-chat.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Gemini in browser reads a ticket, proposes category, waits for confirmation, persists the corrected category and responds through Jami with real AI.",
  );
} finally {
  await browser.close();
}
