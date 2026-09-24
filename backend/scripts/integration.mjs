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
assert.equal(s.summary.budget, 15000);
assert.equal(s.home.preferences.monthlyBudget, 15000);
const recordedPreferences = { ...s.home.preferences };
await api(a, "savePreferences", {
  ...recordedPreferences,
  municipality: "Changed",
  aiConsent: true,
  bankConsent: true,
  members: s.home.members,
});
s = await api(a, "bootstrap");
assert.equal(s.home.preferences.municipality, recordedPreferences.municipality);
assert.equal(s.home.preferences.aiConsent, false);
assert.equal(s.home.preferences.bankConsent, false);
const reply = await api(a, "chat", { message: "¿Cómo van mis gastos?" });
assert.equal(reply.mode, "datos");
assert.match(reply.reply, /15,000/);
await assert.rejects(() => api(a, "deleteMember", { memberId: a.localId }), {
  status: "FAILED_PRECONDITION",
});
await api(a, "savePreferences", {
  ...s.home.preferences,
  members: [
    ...s.home.members,
    { ...member, name: "Removable test profile", income: 500 },
  ],
});
s = await api(a, "bootstrap");
const removable = s.home.members.find(
  (m) => m.name === "Removable test profile",
);
assert.ok(removable);
await api(a, "deleteMember", { memberId: removable.id });
s = await api(a, "bootstrap");
assert.equal(s.home.members.length, 1);
assert.equal(s.summary.budget, 15000);

assert.equal(s.bank.streak, 0);
assert.equal(s.movements.length, 0);
const movement = {
  requestId: crypto.randomUUID(),
  type: "gasto",
  amount: 123.45,
  category: "Alimentación",
  note: "Integration test only",
  date: s.date,
  method: "manual",
};
await api(a, "saveMovement", movement);
await api(a, "saveMovement", movement);
s = await api(a, "bootstrap");
assert.equal(s.movements.length, 1);
assert.equal(s.summary.expenses, 123.45);
await api(a, "saveGoal", { name: "Test goal", target: 1000 });
s = await api(a, "bootstrap");
assert.equal(s.goals[0].saved, 0);
await api(b, "bootstrap");
await api(b, "createHome", { name: "Separate home", members: [member] });
let other = await api(b, "bootstrap");
assert.equal(other.movements.length, 0);
await assert.rejects(() => api(b, "deleteMember", { memberId: a.localId }), {
  status: "NOT_FOUND",
});

await assert.rejects(
  () => api(b, "saveGoal", { id: s.goals[0].id, name: "Attack", target: 1 }),
  { status: "FAILED_PRECONDITION" },
);
await api(b, "savePreferences", {
  municipality: "Other",
  monthlyBudget: 5000,
  lifestyle: "",
  priorities: [],
  assistantTone: "cercano",
  aiConsent: false,
  bankConsent: false,
  privacyAccepted: true,
  alerts: true,
  goals: true,
  donations: false,
  members: other.home.members,
});
await assert.rejects(
  () => api(b, "saveGoal", { id: s.goals[0].id, name: "Attack", target: 1 }),
  { status: "NOT_FOUND" },
);
await assert.rejects(
  () => api(a, "analyze", { method: "audio", text: "test" }),
  { status: "FAILED_PRECONDITION" },
);
const c = await signup();
s = await api(a, "bootstrap");
await api(c, "bootstrap");
await api(c, "joinHome", { code: s.home.invitationCode });
await api(c, "completeMemberProfile", { privacyAccepted: true });
await assert.rejects(() => api(c, "deleteMember", { memberId: a.localId }), {
  status: "PERMISSION_DENIED",
});
await api(c, "saveMovement", {
  ...movement,
  requestId: crypto.randomUUID(),
  note: "Keep after member removal",
});
await api(a, "deleteMember", { memberId: c.localId });
const detached = await api(c, "bootstrap");
assert.equal(detached.home, null);
s = await api(a, "bootstrap");
assert.ok(s.movements.some((m) => m.note === "Keep after member removal"));
const raw = await fetch(
  `http://127.0.0.1:8085/v1/projects/${project}/databases/(default)/documents/hogares/${s.home.id}`,
  { headers: { Authorization: `Bearer ${a.idToken}` } },
);
assert.equal(raw.status, 403);
console.log(
  "PASS: auth, onboarding, persistent profile, idempotent movements, totals, goals, household isolation, AI consent and Firestore rules.",
);
