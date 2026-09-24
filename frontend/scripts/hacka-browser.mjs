import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
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
    .getByRole("textbox", { name: "Correo electrónico" })
    .fill(accounts[0].email);
  await page
    .getByRole("textbox", { name: "Contraseña", exact: true })
    .fill(accounts[0].password);
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Tu dinero, más claro" }),
  ).toBeVisible();
  await expect(
    page.getByText("Hogar de demostración · Datos ficticios", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".household-label")).toHaveText("Hacka");
  await mkdir("/tmp/summa-ui", { recursive: true });
  await page.screenshot({
    path: "/tmp/summa-ui/hacka-home.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Carrito", exact: true }).click();
  await page.getByLabel(/Incluir referencias históricas/).check();
  await page.getByRole("button", { name: "Guardar y comparar" }).click();
  await expect(page.locator(".store-card")).toHaveCount(4);
  await expect(page.getByText("Guardando…", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: "/tmp/summa-ui/hacka-cart.png",
    fullPage: true,
  });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Desbordamiento horizontal");
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS: inicio de sesión Hacka, etiqueta de demo y comparación de cuatro sucursales en móvil.",
  );
} finally {
  await browser.close();
}
