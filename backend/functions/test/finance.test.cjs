const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  ledgerSummary,
  savingsStats,
  nextOccurrence,
  savingsSchema,
  scheduleSchema,
} = require("../lib/finance");
test("received income, additional income, transfers and budget are independent", () => {
  const s = ledgerSummary(
    [
      { type: "ingreso", incomeKind: "regular", amount: 1000 },
      { type: "ingreso", amount: 125 },
      { type: "transferencia", amount: 500 },
      { type: "gasto", amount: 250, category: "Salud" },
    ],
    800,
  );
  assert.equal(s.receivedIncome, 1125);
  assert.equal(s.extraIncome, 125);
  assert.equal(s.balance, 875);
  assert.equal(s.budgetRemaining, 550);
  assert.equal(s.byCategory.find((c) => c.name === "Salud").amount, 250);
  assert.equal(ledgerSummary([], 20000).balance, 0);
});
test("weekly streak crosses year boundaries, excludes opening and future entries, nets withdrawals", () => {
  const entries = [
    { type: "opening", amount: 500, date: "2025-12-15" },
    { type: "contribution", amount: 100, date: "2025-12-23" },
    { type: "contribution", amount: 200, date: "2025-12-30" },
    { type: "withdrawal", amount: 50, date: "2026-01-01" },
    { type: "contribution", amount: 900, date: "2026-01-15" },
  ];
  assert.equal(savingsStats(entries, "2026-01-06").streak, 2);
  assert.equal(savingsStats(entries, "2026-01-13").streak, 0);
  assert.equal(
    savingsStats(
      [...entries, { type: "withdrawal", amount: 150, date: "2026-01-02" }],
      "2026-01-06",
    ).streak,
    0,
  );
});
test("monthly events retain the original day after short months", () => {
  assert.equal(nextOccurrence("2026-01-31", "monthly", 31), "2026-02-28");
  assert.equal(nextOccurrence("2026-02-28", "monthly", 31), "2026-03-31");
  assert.equal(nextOccurrence("2026-12-28", "weekly"), "2027-01-04");
  assert.equal(nextOccurrence("2026-09-24", "once"), null);
});
test("savings and schedules reject invalid dates and missing goal", () => {
  assert.equal(
    savingsSchema.safeParse({
      requestId: crypto.randomUUID(),
      goalId: "x",
      type: "withdrawal",
      amount: 2,
      date: "2026-02-30",
    }).success,
    false,
  );
  assert.equal(
    scheduleSchema.safeParse({
      title: "Ahorro",
      kind: "saving",
      amount: 10,
      nextDate: "2026-09-24",
      frequency: "weekly",
    }).success,
    false,
  );
});
