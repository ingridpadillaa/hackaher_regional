// Explicit local demo check. Does not log passwords or contact production Auth.
import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const access = JSON.parse(
  await readFile(
    new URL("../../backend/.demo-hack-access.local", import.meta.url),
    "utf8",
  ),
);
const account = access.accounts.find((a) => a.uid === "demo-hack-rosy");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .first()
    .click();
  await page.getByLabel("Correo electrónico").fill(account.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(account.password);
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .last()
    .click();
  await page.getByRole("heading", { name: "Presupuesto del hogar" }).waitFor();
  assert.equal(await page.locator(".household-label").innerText(), "Hack");
  await page
    .getByText("Hogar de demostración · Datos ficticios", { exact: true })
    .waitFor();
  assert.match(await page.locator(".budget-legend").innerText(), /27,000/);
  await mkdir("/tmp/summa-ui", { recursive: true });
  await page.screenshot({
    path: "/tmp/summa-ui/11-hack-demo.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Perfil", exact: true }).click();
  assert.match(await page.locator(".profile-members").innerText(), /Rosy/);
  assert.match(await page.locator(".profile-members").innerText(), /Vane/);
  await page
    .getByRole("button", { name: "Abrir chat de Jami", exact: true })
    .click();
  await page
    .getByRole("button", { name: "¿Cómo van mis gastos?", exact: true })
    .click();
  await page
    .getByText("Gemini pendiente de configuración.", { exact: false })
    .waitFor();
  assert.match(await page.locator(".jami-chat-log").innerText(), /27,000/);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Hack demo login, Rosy/Vane, monthly income, demo banner and Jami fallback with seeded data.",
  );
} finally {
  await browser.close();
}
