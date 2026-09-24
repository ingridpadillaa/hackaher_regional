import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDataset, people } from "./hacka-dataset.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { movementSchema } = require("../functions/lib/domain");
const { savingsStats, scheduleSchema } = require("../functions/lib/finance");
test("three-month demo has reconciled income, savings and no fabricated bank/market data", () => {
  for (const end of ["2026-09-24", "2026-01-01", "2024-03-31"]) {
    const { docs, manifest } = buildDataset(end);
    assert.equal(Object.keys(manifest.months).length, 3);
    assert.equal(new Set(docs.map((d) => d.path)).size, docs.length);
    assert.ok(docs.every((d) => d.data.esPrueba && d.data.seedTag));
    const rows = docs
      .filter((d) => d.path.includes("/movements/"))
      .map((d) => d.data);
    for (const m of rows) {
      assert.ok(m.date <= end);
      movementSchema.parse({ ...m, requestId: crypto.randomUUID() });
    }
    const entries = docs
      .filter((d) => d.path.includes("/savingsEntries/"))
      .map((d) => d.data);
    for (const [id, saved] of Object.entries(manifest.saved))
      assert.equal(
        entries
          .filter((e) => e.goalId === id)
          .reduce(
            (s, e) => s + (e.type === "withdrawal" ? -e.amount : e.amount),
            0,
          ),
        saved,
      );
    assert.ok(entries.every((e) => !e.verified && e.source === "manual"));
    for (const d of docs.filter((d) => d.path.includes("/schedules/")))
      scheduleSchema.parse(d.data);
    assert.ok(
      !docs.some((d) => /bankEvidence|prices|catalogProducts/.test(d.path)),
    );
    assert.equal(manifest.profiles.join(", "), "Rosy Herrera, Vane Ramirez");
    assert.deepEqual(buildDataset(end).manifest, manifest);
  }
  const d = buildDataset("2026-09-24");
  assert.equal(
    d.manifest.months["2026-09"].regularIncome,
    people.reduce((s, p) => s + p.income, 0),
  );
  assert.equal(
    savingsStats(
      d.docs
        .filter((d) => d.path.includes("/savingsEntries/"))
        .map((d) => d.data),
      "2026-09-24",
    ).streak,
    12,
  );
});
