// Explicit live-provider smoke test with synthetic fixtures; never reads user documents.
// Run from the repository root after compiling Functions. A small API quota is consumed.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { extractMovements } from "../functions/lib/extraction.js";
import { replyToChat } from "../functions/lib/jami.js";
import { today } from "../functions/lib/domain.js";
process.loadEnvFile("backend/functions/.secret.local");
const secrets = JSON.parse(process.env.SUMMA_INTEGRATIONS);
const date = today();
const browser = await chromium.launch({ headless: true, channel: "chrome" });
let png, pdf;
try {
  const page = await browser.newPage({ viewport: { width: 700, height: 500 } });
  await page.setContent(
    `<html><body style="font:24px Arial;padding:30px"><h1>COMPROBANTE DE PRUEBA</h1><p>Fecha: ${date}</p><p>Servicio de transporte</p><p>Total pagado: $123.45 MXN</p><p>Pago realizado en efectivo</p></body></html>`,
  );
  png = await page.screenshot();
  pdf = await page.pdf({ format: "A5" });
} finally {
  await browser.close();
}
await writeFile("/tmp/summa-gemini-receipt.png", png);
await writeFile("/tmp/summa-gemini-receipt.pdf", pdf);
for (const [label, input, amount] of [
  [
    "texto",
    { method: "audio", text: `El ${date} pagué 123.45 pesos de transporte.` },
    123.45,
  ],
  [
    "imagen",
    { method: "ticket", mimeType: "image/png", base64: png.toString("base64") },
    123.45,
  ],
  [
    "pdf",
    {
      method: "pdf",
      mimeType: "application/pdf",
      base64: pdf.toString("base64"),
    },
    123.45,
  ],
  ...(process.argv[2]
    ? [
        [
          "audio",
          {
            method: "audio",
            mimeType: "audio/wav",
            base64: (await readFile(process.argv[2])).toString("base64"),
          },
          123,
        ],
      ]
    : []),
]) {
  const r = await extractMovements(input, secrets, date);
  assert.equal(r.movements.length, 1, label);
  assert.equal(r.movements[0].amount, amount, label);
  assert.equal(r.movements[0].category, "Transporte", label);
  assert.equal(r.movements[0].date, date, label);
  console.log(
    `PASS Gemini real: ${label}, monto, fecha y categoría correctos.`,
  );
}
const state = {
  user: { personalizacionCompleta: true },
  home: {
    personalized: true,
    esDemo: true,
    members: [],
    preferences: {
      aiConsent: true,
      lifestyle: "Hogar de prueba",
      priorities: ["Fondo de emergencia"],
      assistantTone: "cercano",
    },
  },
  summary: {
    budget: 1000,
    extraIncome: 0,
    expenses: 200,
    remaining: 800,
    byCategory: [{ name: "Transporte", amount: 200 }],
  },
  goals: [],
};
const chat = await replyToChat(
  "¿Cómo puedo organizar mis gastos?",
  state,
  secrets,
  ["Quiero empezar un fondo de emergencia"],
);
assert.equal(chat.mode, "ia", chat.notice);
assert.match(chat.reply, /800/);
console.log(
  "PASS Gemini real: Jami responde con IA y conserva las cifras calculadas.",
);
