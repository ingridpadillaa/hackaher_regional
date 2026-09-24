const { test } = require("node:test");
const assert = require("node:assert/strict");
const { generateJson } = require("../lib/gemini.js");
const { analysisParts, extractMovements } = require("../lib/extraction.js");
const secrets = { geminiKey: "unit-test-key", geminiModel: "configured-model" };
const result = {
  transcript: "Gasto de prueba",
  warning: "",
  movements: [
    {
      type: "gasto",
      amount: 123,
      category: "Transporte",
      note: "Prueba",
      date: "2026-09-23",
    },
  ],
};
const response = (value, finishReason = "STOP") => ({
  ok: true,
  json: async () => ({
    candidates: [
      { finishReason, content: { parts: [{ text: JSON.stringify(value) }] } },
    ],
  }),
});
test("extraction validates file method, signatures and empty input before calling AI", () => {
  assert.throws(() => analysisParts({ method: "audio" }), /Agrega/);
  assert.throws(
    () =>
      analysisParts({
        method: "ticket",
        mimeType: "image/png",
        base64: Buffer.from("not an image").toString("base64"),
      }),
    /contenido/,
  );
  assert.throws(
    () =>
      analysisParts({
        method: "ticket",
        mimeType: "application/pdf",
        base64: Buffer.from("%PDF-1.4\n").toString("base64"),
      }),
    /contenido/,
  );
  assert.throws(
    () =>
      analysisParts({
        method: "pdf",
        mimeType: "application/pdf",
        base64: "%%%%",
      }),
    /inválido/,
  );
});
test("extraction enforces categories, valid dates, positive amounts and future dates", async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => response(result);
    assert.equal(
      (
        await extractMovements(
          { method: "audio", text: "Gasto de prueba" },
          secrets,
          "2026-09-24",
        )
      ).movements[0].amount,
      123,
    );
    for (const edit of [
      { amount: -1 },
      { date: "2026-02-30" },
      { date: "2026-09-25" },
      { category: "Inventada" },
    ]) {
      global.fetch = async () =>
        response({
          ...result,
          movements: [{ ...result.movements[0], ...edit }],
        });
      await assert.rejects(
        () =>
          extractMovements(
            { method: "audio", text: "prueba" },
            secrets,
            "2026-09-24",
          ),
        /validar/,
      );
    }
  } finally {
    global.fetch = original;
  }
});
test("Gemini client uses configured model, limits and controlled provider errors", async () => {
  const original = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.match(url, /configured-model:generateContent$/);
      assert.equal(options.headers["x-goog-api-key"], "unit-test-key");
      return { ok: false, status: 429 };
    };
    await assert.rejects(
      () => generateJson(secrets, "test", [{ text: "test" }], {}),
      (e) => e.code === "resource-exhausted",
    );
    global.fetch = async () => response(result, "MAX_TOKENS");
    await assert.rejects(
      () => generateJson(secrets, "test", [{ text: "test" }], {}),
      /completo/,
    );
    global.fetch = async () => {
      throw new Error("raw provider details must not escape");
    };
    await assert.rejects(
      () => generateJson(secrets, "test", [{ text: "test" }], {}),
      (e) => e.code === "unavailable" && !e.message.includes("raw provider"),
    );
  } finally {
    global.fetch = original;
  }
});
