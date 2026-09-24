// Local UI verification. Does not navigate to, sign in to, or purchase from a retailer.
import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const access = JSON.parse(
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
    .fill(access.accounts[0].email);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(access.accounts[0].password);
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .last()
    .click();
  await page.getByRole("link", { name: "Carrito", exact: true }).click();
  const panel = page.getByRole("region", { name: "Carrito en H-E-B" });
  await panel.getByRole("button", { name: "Comprobar envío a H-E-B" }).click();
  await expect(panel.getByRole("status")).toContainText(
    "pendiente de verificación",
  );
  await expect(
    panel.getByRole("link", { name: "Abrir mi mandado en H-E-B" }),
  ).toHaveCount(0);
  await page.route("**/demo-summa/us-central1/api", (route) => {
    const d = route.request().postDataJSON()?.data;
    if (d?.action !== "prepareRetailerCart") return route.continue();
    return route.fulfill({
      json: {
        result: {
          ready: true,
          message: "Fixture verificada solo para prueba de interfaz",
          url: "https://www.heb.com.mx/checkout/cart/add?sku=100&qty=2&seller=1&sc=1&redirect=true",
        },
      },
    });
  });
  await panel.getByRole("button", { name: "Comprobar envío a H-E-B" }).click();
  await expect(
    panel.getByRole("link", { name: "Abrir mi mandado en H-E-B" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Agregar una unidad/ })
    .first()
    .click();
  await expect(
    panel.getByRole("link", { name: "Abrir mi mandado en H-E-B" }),
  ).toHaveCount(0);
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS: unverified retailer has no transfer link; edits invalidate prepared links. No external cart created.",
  );
} finally {
  await browser.close();
}
