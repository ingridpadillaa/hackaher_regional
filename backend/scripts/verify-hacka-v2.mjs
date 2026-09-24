// Read-only checks against the local demonstration through the actual callable API.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const access = JSON.parse(
  await readFile(
    new URL("../.demo-hacka-v2-access.local", import.meta.url),
    "utf8",
  ),
);
const manifest = JSON.parse(
  await readFile(
    new URL("../data/hacka-v2-manifest.json", import.meta.url),
    "utf8",
  ),
);
for (const account of access.accounts) {
  const response = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: account.email,
        password: account.password,
        returnSecureToken: true,
      }),
    },
  );
  const login = await response.json();
  assert.ok(login.idToken, "Cuenta de demo accesible");
  async function api(action, payload = {}) {
    const r = await fetch("http://127.0.0.1:5001/demo-summa/us-central1/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${login.idToken}`,
      },
      body: JSON.stringify({ data: { action, payload } }),
    });
    const body = await r.json();
    assert.ok(!body.error, body.error?.message);
    return body.result;
  }
  const state = await api("bootstrap");
  assert.equal(state.home.name, "Hacka");
  assert.equal(state.home.esDemo, true);
  assert.equal(state.home.members.length, 2);
  assert.equal(state.bank.connected, false);
  assert.equal(state.bank.streak, 0);
  assert.ok(state.savings.streak > 0);
  assert.equal(state.schedules.length, 3);
  assert.equal(state.cart.length, 4);
  for (const goal of state.goals)
    assert.equal(goal.saved, manifest.saved[goal.id]);
  for (const [month, expected] of Object.entries(manifest.months)) {
    const { summary } = await api("report", { month });
    assert.equal(
      summary.receivedIncome,
      expected.regularIncome + expected.extraIncome,
    );
    assert.equal(summary.extraIncome, expected.extraIncome);
    assert.equal(summary.expenses, expected.expenses);
    assert.equal(
      summary.balance,
      expected.regularIncome + expected.extraIncome - expected.expenses,
    );
    assert.equal(summary.budget, expected.budget);
  }
  const offers = await api("compareCart", {
    items: state.cart,
    historical: true,
  });
  assert.equal(offers.length, 4);
  assert.ok(offers.some((o) => o.matchedCount > 0));
  const tampicoOffers = await api("compareCart", {
    items: state.cart,
    historical: true,
    area: {
      municipality: "Tampico",
      state: "Tamaulipas",
      latitude: 22.2852,
      longitude: -97.8778,
      source: "browser",
    },
  });
  assert.equal(tampicoOffers.length, 4);
  assert.ok(tampicoOffers.every((o) => o.municipality === "Tampico"));
  assert.ok(tampicoOffers.every((o) => o.distanceKm <= 20));
}
console.log(
  "PASS: dos cuentas, tres reportes conciliados, metas/racha declarada, agenda y sucursales PROFECO por ubicación; sin evidencia bancaria inventada.",
);
