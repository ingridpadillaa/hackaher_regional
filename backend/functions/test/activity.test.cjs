const { test } = require("node:test");
const assert = require("node:assert/strict");
const { activityStats, localDay } = require("../lib/activity");
const expense = (date, extra = {}) => ({
  ownerUid: "a",
  type: "gasto",
  method: "manual",
  date,
  createdAt: date + "T18:00:00Z",
  ...extra,
});
const check = (date) => ({ date, noExpense: true });
test("personal daily streak counts once and excludes income, past entries and other users", () => {
  const list = [
    expense("2026-09-24"),
    expense("2026-09-24"),
    expense("2026-09-23", { ownerUid: "b" }),
    expense("2026-09-23", { type: "ingreso" }),
    expense("2026-09-22", { createdAt: "2026-09-24T18:00:00Z" }),
  ];
  assert.deepEqual(activityStats(list, [], "a", "2026-09-24"), {
    streak: 1,
    best: 1,
    monthDays: 1,
    todayStatus: "expense",
  });
});
test("no-expense confirmations persist; expense takes precedence without double count", () => {
  const checks = [check("2026-09-23"), check("2026-09-24")];
  assert.equal(
    activityStats([], checks, "a", "2026-09-24").todayStatus,
    "no-expense",
  );
  assert.deepEqual(
    activityStats([expense("2026-09-24")], checks, "a", "2026-09-24"),
    { streak: 2, best: 2, monthDays: 2, todayStatus: "expense" },
  );
});
test("today stays open until midnight; gaps reset current but retain best across months", () => {
  const checks = ["2026-08-30", "2026-08-31", "2026-09-01"].map(check);
  assert.equal(activityStats([], checks, "a", "2026-09-02").streak, 3);
  assert.deepEqual(activityStats([], checks, "a", "2026-09-03"), {
    streak: 0,
    best: 3,
    monthDays: 1,
    todayStatus: "pending",
  });
});
test("removed expense and superseded confirmation do not count", () => {
  assert.equal(
    activityStats(
      [],
      [{ date: "2026-09-24", noExpense: false }],
      "a",
      "2026-09-24",
    ).streak,
    0,
  );
});
test("server day uses Monterrey and ignores malformed dates", () => {
  assert.equal(localDay("2026-09-25T03:00:00Z"), "2026-09-24");
  assert.equal(localDay("invalid"), "");
});
