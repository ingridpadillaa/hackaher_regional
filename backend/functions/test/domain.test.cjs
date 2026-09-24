const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  summarize,
  verifiedStreak,
  seasonalForecast,
  simulate,
  movementSchema,
  preferencesSchema,
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
