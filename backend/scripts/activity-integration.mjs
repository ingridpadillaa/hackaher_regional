import assert from "node:assert/strict";
const project = "demo-summa";
const auth = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const endpoint = `http://127.0.0.1:5001/${project}/us-central1/api`;
async function signup() {
  const r = await fetch(`${auth}/accounts:signUp?key=demo-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `test-${crypto.randomUUID()}@example.test`,
      password: "test-password-123",
      returnSecureToken: true,
    }),
  });
  const d = await r.json();
  assert.ok(d.idToken, JSON.stringify(d));
  return d;
}
async function api(user, action, payload = {}) {
  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(user ? { Authorization: `Bearer ${user.idToken}` } : {}),
    },
    body: JSON.stringify({ data: { action, payload } }),
  });
  const d = await r.json();
  if (d.error)
    throw Object.assign(new Error(d.error.message), { status: d.error.status });
  return d.result;
}
const a = await signup(),
  b = await signup();
await assert.rejects(() => api(null, "bootstrap"), {
  status: "UNAUTHENTICATED",
});
const first = await api(a, "bootstrap");
assert.equal(first.home, null);
const member = {
  name: "Integration test",
  age: 30,
  relationship: "Administrador",
  education: "Universidad",
  occupation: "Empleado",
  income: 15000,
  period: "mensual",
};
await api(a, "createHome", { name: "Isolated test home", members: [member] });
let s = await api(a, "bootstrap");
assert.equal(s.user.personalizacionCompleta, false);
await assert.rejects(
  () => api(a, "saveGoal", { name: "Too early", target: 100 }),
  { status: "FAILED_PRECONDITION" },
);
await api(a, "savePreferences", {
  municipality: "Test municipality",
  lifestyle: "",
  priorities: [],
  assistantTone: "cercano",
  aiConsent: false,
  bankConsent: false,
  privacyAccepted: true,
  alerts: true,
  goals: true,
  donations: false,
  members: s.home.members,
});
s = await api(a, "bootstrap");
assert.equal(s.user.personalizacionCompleta, true);
assert.equal(s.summary.budget, 0);
assert.equal(s.home.preferences.monthlyBudget, 0);

assert.equal(s.activity.todayStatus, "pending");
await Promise.all([api(a, "confirmNoExpense"), api(a, "confirmNoExpense")]);
s = await api(a, "bootstrap");
assert.equal(s.activity.streak, 1);
assert.equal(s.activity.todayStatus, "no-expense");
assert.equal(s.movements.length, 0);
const movement = {
  requestId: crypto.randomUUID(),
  type: "gasto",
  amount: 20,
  category: "Otros",
  note: "Daily review test",
  date: s.date,
  method: "manual",
};
await api(a, "saveMovement", movement);
await api(a, "saveMovement", movement);
s = await api(a, "bootstrap");
assert.equal(s.activity.streak, 1);
assert.equal(s.activity.todayStatus, "expense");
await assert.rejects(() => api(a, "confirmNoExpense"), {
  status: "FAILED_PRECONDITION",
});
await api(b, "createHome", { name: "Other household", members: [member] });
let other = await api(b, "bootstrap");
assert.equal(other.activity.streak, 0);
await assert.rejects(() => api(null, "confirmNoExpense"), {
  status: "UNAUTHENTICATED",
});
console.log(
  "PASS: authenticated daily confirmation, concurrent retries, no fake movement, expense precedence, idempotent save, personal isolation.",
);
