const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  summarize,
  verifiedStreak,
  seasonalForecast,
  simulate,
  movementSchema,
  preferencesSchema,
  monthlyIncome,
} = require("../lib/domain.js");
test("monthly totals distinguish additional income from expenses without floating point drift", () => {
  const r = summarize(
    [
      { type: "gasto", amount: 0.1, category: "Alimentación" },
      { type: "gasto", amount: 0.2, category: "Alimentación" },
      { type: "ingreso", amount: 500 },
    ],
    1000,
  );
  assert.equal(r.expenses, 0.3);
  assert.equal(r.extraIncome, 500);
  assert.equal(r.remaining, 1499.7);
});
test("streak requires consecutive verified banking evidence, including yesterday before today is synced", () => {
  const evidence = [
    {
      date: "2026-09-21",
      source: "open_banking",
      verified: true,
      netSavings: 10,
    },
    {
      date: "2026-09-22",
      source: "open_banking",
      verified: true,
      netSavings: 20,
    },
  ];
  assert.equal(verifiedStreak(evidence, "2026-09-23"), 2);
  assert.equal(
    verifiedStreak(
      [
        ...evidence,
        {
          date: "2026-09-23",
          source: "manual",
          verified: true,
          netSavings: 100,
        },
      ],
      "2026-09-23",
    ),
    2,
  );
  assert.equal(
    verifiedStreak(
      [
        ...evidence,
        {
          date: "2026-09-23",
          source: "open_banking",
          verified: true,
          netSavings: 0,
        },
      ],
      "2026-09-23",
    ),
    0,
  );
  assert.equal(verifiedStreak(evidence, "2026-09-24"), 0);
});
test("new household has no fabricated seasonal forecast", () => {
  const f = seasonalForecast("2026-09-23", []);
  assert.equal(f.name, "Día de Muertos");
  assert.equal(f.date, "2026-11-02");
  assert.equal(f.extra, null);
});
test("calendar rolls into next year", () =>
  assert.equal(seasonalForecast("2026-12-30", []).date, "2027-01-06"));
test("simulator uses remaining balance, never mutates savings", () => {
  assert.deepEqual(simulate(12000, 6000, 500, "mes"), {
    remaining: 6000,
    periods: 12,
    period: "mes",
  });
  assert.equal(simulate(100, 0, 0, "mes").periods, null);
});
test("movement rejects invalid date, negative money and unknown category", () => {
  const base = {
    requestId: crypto.randomUUID(),
    type: "gasto",
    amount: 5,
    category: "Salud",
    note: "",
    date: "2026-09-23",
    method: "manual",
  };
  assert.equal(movementSchema.safeParse(base).success, true);
  for (const edit of [
    { amount: -1 },
    { date: "2026-02-30" },
    { category: "unknown" },
  ])
    assert.equal(movementSchema.safeParse({ ...base, ...edit }).success, false);
});

test("household income uses each recorded payment frequency, including zero income", () => {
  assert.equal(
    monthlyIncome([
      { income: 3000, period: "mensual" },
      { income: 2000, period: "quincenal" },
      { income: 1200, period: "semanal" },
    ]),
    12200,
  );
  assert.equal(monthlyIncome([{ income: 0, period: "mensual" }]), 0);
});

const { groundedReply, replyToChat } = require("../lib/jami.js");
test("Jami uses recorded household totals without claiming AI or banking verification", async () => {
  const state = {
    user: { personalizacionCompleta: true },
    home: { personalized: true, preferences: { aiConsent: true } },
    summary: {
      budget: 1200,
      extraIncome: 50,
      expenses: 200,
      remaining: 1050,
      byCategory: [],
    },
    goals: [{ target: 1000, saved: 100 }],
  };
  const result = await replyToChat("gastos", state, {});
  assert.equal(result.mode, "datos");
  assert.match(result.reply, /1,050/);
  assert.match(result.notice, /pendiente/);
  assert.equal(groundedReply("carrito", state).route, "/carrito");
  assert.match(groundedReply("metas", state).reply, /900/);
  assert.match(
    groundedReply("hola", { user: {}, home: null }).reply,
    /Primero crea/,
  );
  const noConsent = await replyToChat(
    "gastos",
    { ...state, home: { ...state.home, preferences: { aiConsent: false } } },
    { geminiKey: "not-used", geminiModel: "not-used" },
  );
  assert.equal(noConsent.mode, "datos");
  assert.match(noConsent.notice, /no autorizada/);
});

test("Jami sends only sanitized context and falls back when the provider returns unvalidated amounts", async () => {
  const state = {
    user: { nombre: "Rosy", personalizacionCompleta: true },
    home: {
      name: "Hack",
      personalized: true,
      members: [{ name: "Rosy" }],
      preferences: {
        aiConsent: true,
        lifestyle: "Rosy usa transporte",
        priorities: ["Viaje"],
      },
    },
    summary: {
      budget: 1200,
      extraIncome: 0,
      expenses: 200,
      remaining: 1000,
      byCategory: [],
    },
  };
  const originalFetch = global.fetch;
  let request;
  try {
    global.fetch = async (_url, options) => {
      request = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      advice: "Revisa tus gastos antes de decidir un aporte.",
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    };
    const reply = await replyToChat("Soy Rosy, rosy@example.test", state, {
      geminiKey: "test-only",
      geminiModel: "configured-test-model",
    });
    assert.equal(reply.mode, "ia");
    assert.equal(JSON.stringify(request).includes("rosy@example.test"), false);
    assert.equal(JSON.stringify(request).includes("Rosy"), false);
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: '{"advice":"Tienes $5000"}' }] } },
        ],
      }),
    });
    assert.equal(
      (
        await replyToChat("hola", state, {
          geminiKey: "test-only",
          geminiModel: "configured-test-model",
        })
      ).mode,
      "datos",
    );
  } finally {
    global.fetch = originalFetch;
  }
});
