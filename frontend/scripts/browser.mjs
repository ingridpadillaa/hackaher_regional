import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await mkdir("/tmp/summa-ui", { recursive: true });
const email = `browser-${crypto.randomUUID()}@example.test`;
await page.goto("http://127.0.0.1:5173");
await page.getByRole("heading", { name: "¡Bienvenido a SUMMA!" }).waitFor();
await page
  .getByRole("button", { name: "Abrir chat de Jami", exact: true })
  .click();
await page
  .getByRole("textbox", { name: "Mensaje para Jami" })
  .fill("¿Cómo empiezo?");
await page.getByRole("button", { name: "Enviar mensaje" }).click();
await page.getByText("Guía de uso · sin IA", { exact: true }).waitFor();
await page.getByRole("button", { name: "Cerrar conversación" }).click();

await page.screenshot({ path: "/tmp/summa-ui/01-login.png", fullPage: true });
await page
  .getByRole("textbox", { name: "Nombre completo" })
  .fill("Prueba local");
await page.getByRole("textbox", { name: "Correo electrónico" }).fill(email);
await page
  .getByRole("textbox", { name: "Contraseña", exact: true })
  .fill("test-password-123");
await page.getByRole("button", { name: "Crear mi cuenta" }).click();
await page.getByRole("heading", { name: "Crea tu hogar" }).waitFor();
await page
  .getByPlaceholder("Ponle un nombre a tu hogar")
  .fill("Mi hogar de prueba");
await page.getByRole("button", { name: "Agregar perfil" }).click();
await page
  .getByRole("dialog")
  .getByLabel("Nombre", { exact: true })
  .fill("Prueba local");
const age = page.getByLabel("Edad", { exact: true });
assert.equal(await age.inputValue(), "");
await age.fill("30");
await age.fill("");
assert.equal(await age.inputValue(), "");
await age.fill("30");
await page.getByLabel("Estudios", { exact: true }).selectOption("Universidad");
await page.getByLabel("Trabajo u ocupación").fill("Empleado");
const income = page.getByLabel("Ingreso", { exact: true });
assert.equal(await income.inputValue(), "");
await income.fill("123");
await income.fill("");
assert.equal(await income.inputValue(), "");
await income.fill("15000");
await page.getByRole("button", { name: "Guardar perfil" }).click();
await page.screenshot({ path: "/tmp/summa-ui/02-house.png", fullPage: true });
await page.getByRole("button", { name: "Crear hogar y continuar" }).click();
await page
  .getByRole("heading", { name: "Personaliza tu experiencia" })
  .waitFor();
assert.equal(await page.getByRole("navigation").count(), 0);
await page.getByLabel("Municipio", { exact: true }).fill("Monterrey");
assert.equal(
  await page.getByLabel("Presupuesto mensual (MXN)", { exact: true }).count(),
  0,
);
assert.match(
  await page.getByRole("region", { name: "Ingreso registrado" }).innerText(),
  /15,000/,
);
const checks = await page.locator(".check-line").evaluateAll((labels) =>
  labels.map((label) => {
    const input = label.querySelector("input").getBoundingClientRect();
    const text = label.querySelector("span").getBoundingClientRect();
    return { x: input.x, textX: text.x, y: input.y, textY: text.y };
  }),
);
assert.equal(checks.length, 3);
assert.ok(
  checks.every(
    (c) =>
      c.x === checks[0].x &&
      c.textX === checks[0].textX &&
      Math.abs(c.y - c.textY) < 2,
  ),
);
await page.getByLabel("Acepto el").check();
await page.screenshot({ path: "/tmp/summa-ui/03-profile.png", fullPage: true });
await page
  .getByRole("button", { name: "Guardar preferencias y empezar" })
  .click();
await page.getByRole("heading", { name: "Presupuesto del hogar" }).waitFor();
assert.equal(await page.getByRole("navigation").getByRole("link").count(), 4);
await page.screenshot({ path: "/tmp/summa-ui/04-home.png", fullPage: true });
await page.getByRole("button", { name: /Registra movimiento/ }).click();
await page.getByRole("dialog").waitFor();
await page.getByLabel("Monto", { exact: true }).fill("250");
await page.getByLabel("Nota (opcional)").fill("Compra de prueba");
await page.screenshot({
  path: "/tmp/summa-ui/05-movement.png",
  fullPage: true,
});
await page.getByRole("button", { name: "Guardar movimiento" }).click();
await page.getByText("Compra de prueba", { exact: true }).waitFor();
await page.reload();
await page.getByRole("heading", { name: "Presupuesto del hogar" }).waitFor();
await page.getByRole("link", { name: "Carrito", exact: true }).click();
const nearby = page.getByRole("region", { name: "Supermercados cercanos" });
assert.match(
  await nearby
    .getByRole("link", { name: "Buscar en Monterrey" })
    .getAttribute("href"),
  /api=1/,
);
await page.evaluate(() => {
  window.originalGetPosition = navigator.geolocation.getCurrentPosition.bind(
    navigator.geolocation,
  );
  navigator.geolocation.getCurrentPosition = (_success, failure) =>
    failure({ code: 1 });
});
await nearby.getByRole("button", { name: "Usar mi ubicación" }).click();
await nearby
  .getByText("No autorizaste la ubicación.", { exact: false })
  .waitFor();
await page.evaluate(() => {
  navigator.geolocation.getCurrentPosition = window.originalGetPosition;
});
await context.grantPermissions(["geolocation"]);
await context.setGeolocation({ latitude: 25.6866, longitude: -100.3161 });
await nearby.getByRole("button", { name: "Usar mi ubicación" }).click();
const maps = nearby.getByRole("link", {
  name: "Ver supermercados cerca de mí",
});
await maps.waitFor();
assert.match(
  decodeURIComponent(await maps.getAttribute("href")),
  /25.6866,-100.3161/,
);
await nearby
  .getByRole("button", { name: "Dejar de usar mi ubicación" })
  .click();
await nearby.getByRole("link", { name: "Buscar en Monterrey" }).waitFor();

await page.getByRole("button", { name: "Agregar producto a mi lista" }).click();
await page
  .getByRole("dialog")
  .getByLabel("Producto", { exact: true })
  .fill("Producto de prueba");
await page
  .getByRole("button", { name: "Agregar producto", exact: true })
  .click();
await page.getByRole("button", { name: "Guardar y comparar" }).click();
await page.getByRole("button", { name: "Ir a Aurrera" }).waitFor();
await page.screenshot({ path: "/tmp/summa-ui/06-cart.png", fullPage: true });
await page.getByRole("link", { name: "Simulador", exact: true }).click();
await page.getByRole("button", { name: "Crear meta", exact: true }).click();
await page.getByLabel("Título de tu meta").fill("Mi viaje");
await page.getByLabel("¿Cuánto quieres ahorrar? (MXN)").fill("12000");
await page
  .getByRole("dialog")
  .getByRole("button", { name: "Crear meta", exact: true })
  .click();
await page.getByRole("heading", { name: "Mi viaje" }).waitFor();
await page.getByLabel("Aporte para la simulación").fill("500");
await page.getByText("24 meses", { exact: true }).waitFor();
await page.screenshot({
  path: "/tmp/summa-ui/07-simulator.png",
  fullPage: true,
});
await page.getByRole("button", { name: /Notificaciones/ }).click();
await page.getByRole("dialog").waitFor();
await page.screenshot({
  path: "/tmp/summa-ui/08-notifications.png",
  fullPage: true,
});
await page.getByRole("button", { name: "Cerrar", exact: true }).click();
await page.getByRole("link", { name: "Perfil", exact: true }).click();
assert.equal(
  await page
    .getByRole("heading", { name: "Ingreso mensual del hogar", exact: true })
    .count(),
  0,
);
assert.equal(
  await page
    .getByRole("heading", { name: "Ubicación del hogar", exact: true })
    .count(),
  0,
);
assert.equal(
  await page
    .getByRole("heading", { name: "Privacidad y permisos", exact: true })
    .count(),
  0,
);
assert.equal(
  await page.getByRole("button", { name: /^Trabajo e ingresos/ }).count(),
  0,
);
assert.equal(await page.getByRole("button", { name: /^Estudios/ }).count(), 0);
await page
  .locator(".profile-members")
  .getByRole("button", { name: /Prueba local/ })
  .click();
assert.equal(
  await page
    .getByRole("button", { name: "Eliminar perfil", exact: true })
    .count(),
  0,
);
await page
  .getByRole("button", { name: "Abrir chat de Jami", exact: true })
  .click();
await page
  .getByRole("button", { name: "¿Cómo van mis gastos?", exact: true })
  .click();
await page.getByText("IA no autorizada.", { exact: false }).waitFor();
await page.screenshot({ path: "/tmp/summa-ui/09-jami.png", fullPage: true });
await page.getByRole("button", { name: "Cerrar conversación" }).click();
await page.getByRole("button", { name: "Cerrar", exact: true }).click();
await page
  .locator(".profile-members")
  .getByRole("button", { name: /Agregar/ })
  .click();
await page
  .getByRole("dialog")
  .getByLabel("Nombre", { exact: true })
  .fill("Perfil temporal");
await page.getByLabel("Edad", { exact: true }).fill("22");
await page.getByLabel("Estudios", { exact: true }).selectOption("Universidad");
await page.getByLabel("Trabajo u ocupación").fill("Estudiante");
await page.getByLabel("Ingreso", { exact: true }).fill("0");
await page.getByRole("button", { name: "Guardar perfil", exact: true }).click();
await page
  .getByRole("button", { name: "Guardar preferencias", exact: true })
  .click();
await page.getByText("Preferencias guardadas.", { exact: true }).waitFor();
await page
  .locator(".profile-members")
  .getByRole("button", { name: /Perfil temporal/ })
  .click();
assert.equal(
  await page.getByLabel("Ingreso", { exact: true }).inputValue(),
  "0",
);
await page
  .getByRole("button", { name: "Eliminar perfil", exact: true })
  .click();
await page
  .getByRole("button", { name: "Sí, eliminar perfil", exact: true })
  .click();
await page
  .getByRole("heading", { name: "Eliminar perfil", exact: true })
  .waitFor({ state: "hidden" });
assert.equal(
  await page
    .locator(".profile-members")
    .getByRole("button", { name: /Perfil temporal/ })
    .count(),
  0,
);
await page.screenshot({ path: "/tmp/summa-ui/10-profile.png", fullPage: true });

await page.getByRole("button", { name: "Cerrar sesión" }).click();
await page
  .getByRole("button", { name: "Iniciar sesión", exact: true })
  .first()
  .click();
await page.getByRole("textbox", { name: "Correo electrónico" }).fill(email);
await page
  .getByRole("textbox", { name: "Contraseña", exact: true })
  .fill("test-password-123");
await page
  .getByRole("button", { name: "Iniciar sesión", exact: true })
  .last()
  .click();
await page.getByRole("heading", { name: "Presupuesto del hogar" }).waitFor();
await page.getByText("Compra de prueba", { exact: true }).waitFor();
assert.deepEqual(errors, []);
assert.ok(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
console.log(
  "PASS: mobile account → household → required profile → four modules, persisted movement/cart/goal, simulator, notifications, logout/login returns home; no browser errors or horizontal overflow.",
);
await browser.close();
