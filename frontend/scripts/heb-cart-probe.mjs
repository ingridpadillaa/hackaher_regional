// External pilot, in a fresh anonymous browser. Adds items only with --test-cart.
// Stops at access denial; never changes identity, solves challenges, signs in or pays.
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { hebPilot } from "../../backend/scripts/heb-pilot-products.mjs";
const args = process.argv.slice(2),
  idx = args.indexOf("--manifest");
const manifest =
  idx < 0 ? hebPilot : JSON.parse(await readFile(args[idx + 1], "utf8"));
if (!Array.isArray(manifest.candidates) || manifest.candidates.length !== 3)
  throw Error("Se requieren exactamente tres productos para el piloto.");
for (const p of manifest.candidates) {
  const u = new URL(p.productUrl);
  if (
    u.origin !== "https://www.heb.com.mx" ||
    !u.pathname.endsWith("/p") ||
    u.search ||
    u.hash ||
    u.username ||
    u.password ||
    !Number.isInteger(p.quantity) ||
    p.quantity < 1 ||
    p.quantity > 10
  )
    throw Error("Producto o cantidad no válido.");
}
const output = resolve("/tmp/summa-heb-pilot");
await mkdir(output, { recursive: true });
const report = {
  checkedAt: new Date().toISOString(),
  status: "unverified",
  quantitiesMatched: false,
  existingCartPreserved: false,
  purchased: false,
  products: manifest.candidates.map((p) => ({
    name: p.name,
    quantity: p.quantity,
    productUrl: p.productUrl,
  })),
  reason: "",
};
const browser = await chromium.launch({
  channel: "chrome",
  headless: !args.includes("--visible"),
});
try {
  const context = await browser.newContext(),
    page = await context.newPage();
  async function denied(response) {
    if ([401, 403, 429].includes(response?.status())) return true;
    const texts = await Promise.all(
      page.frames().map((f) =>
        f
          .locator("body")
          .innerText({ timeout: 3000 })
          .catch(() => ""),
      ),
    );
    return /access denied|error 15|request was blocked|verify you are human|captcha/i.test(
      texts.join(" "),
    );
  }
  const response = await page.goto("https://www.heb.com.mx/", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForTimeout(2000);
  if (await denied(response)) {
    report.status = "blocked";
    report.reason =
      "H-E-B rechazó el acceso desde este entorno. No se intentó crear el carrito.";
  } else {
    for (const candidate of manifest.candidates) {
      const r = await page.goto(candidate.productUrl, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await page.waitForTimeout(1000);
      if (await denied(r)) {
        report.status = "blocked";
        report.reason =
          "H-E-B bloqueó la consulta de productos. No se intentó crear el carrito.";
        break;
      }
      if (!r?.ok()) {
        report.reason = "Una ficha de producto no está disponible.";
        break;
      }
    }
    if (!report.reason && !args.includes("--test-cart"))
      report.reason =
        "Fichas accesibles; falta ejecutar --test-cart con SKU de checkout, vendedor y canal verificados. No se añadió ningún producto.";
    if (!report.reason && args.includes("--test-cart")) {
      for (const p of manifest.candidates)
        if (
          !p.checkout ||
          !/^\d{1,20}$/.test(p.checkout.sku) ||
          !/^\w[\w-]{0,79}$/.test(p.checkout.seller) ||
          !/^\d{1,8}$/.test(p.checkout.salesChannel)
        )
          throw Error(
            "Faltan identificadores de checkout verificados; no se deducen del número de la ficha.",
          );
      if (
        new Set(manifest.candidates.map((p) => p.checkout.salesChannel))
          .size !== 1 ||
        new Set(
          manifest.candidates.map(
            (p) => p.checkout.sku + ":" + p.checkout.seller,
          ),
        ).size !== 3
      )
        throw Error("El canal o las equivalencias son inconsistentes.");
      const cartUrl = (products) => {
        const u = new URL("https://www.heb.com.mx/checkout/cart/add");
        for (const p of products) {
          u.searchParams.append("sku", p.checkout.sku);
          u.searchParams.append("qty", String(p.quantity));
          u.searchParams.append("seller", p.checkout.seller);
        }
        u.searchParams.set("sc", products[0].checkout.salesChannel);
        u.searchParams.set("redirect", "true");
        return u.toString();
      };
      const readCart = async () => {
        const r = await context.request.get(
          "https://www.heb.com.mx/api/checkout/pub/orderForm",
          { timeout: 20000, maxRedirects: 0 },
        );
        if (!r.ok())
          throw Error("La lectura documentada del carrito no está disponible.");
        const body = await r.json();
        if (!Array.isArray(body.items))
          throw Error("Respuesta de carrito inválida.");
        return body.items.map((i) => ({
          sku: String(i.id),
          seller: String(i.seller),
          quantity: i.quantity,
        }));
      };
      if ((await readCart()).length)
        throw Error("La sesión aislada no está vacía. Prueba detenida.");
      const r = await page.goto(cartUrl(manifest.candidates), {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await page.waitForTimeout(2000);
      if (await denied(r)) {
        report.status = "blocked";
        report.reason = "El sitio bloqueó el enlace de carrito.";
      } else {
        const items = await readCart();
        report.quantitiesMatched =
          items.length === 3 &&
          manifest.candidates.every((p) =>
            items.some(
              (i) =>
                i.sku === p.checkout.sku &&
                i.seller === p.checkout.seller &&
                i.quantity === p.quantity,
            ),
          );
        if (report.quantitiesMatched) {
          // Reopen a single-item link and ensure the other two existing lines survive.
          const repeated = await page.goto(cartUrl([manifest.candidates[0]]), {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          });
          await page.waitForTimeout(1000);
          if (await denied(repeated))
            throw Error(
              "Acceso bloqueado al comprobar conservación del carrito.",
            );
          const after = await readCart();
          report.existingCartPreserved =
            after.length === 3 &&
            manifest.candidates
              .slice(1)
              .every((p) =>
                after.some(
                  (i) =>
                    i.sku === p.checkout.sku &&
                    i.seller === p.checkout.seller &&
                    i.quantity === p.quantity,
                ),
              );
          report.repeatQuantity =
            after.find((i) => i.sku === manifest.candidates[0].checkout.sku)
              ?.quantity ?? null;
        }
        report.status =
          report.quantitiesMatched && report.existingCartPreserved
            ? "verified"
            : "unverified";
        report.reason =
          report.status === "verified"
            ? "Tres productos y cantidades comprobados en sesión anónima. No se compró."
            : "El carrito no coincide con la lista completa; no habilitar la integración.";
      }
    }
  }
} catch (e) {
  report.reason = e.message;
  report.status = "unverified";
} finally {
  await browser.close();
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "verified") process.exitCode = 2;
}
