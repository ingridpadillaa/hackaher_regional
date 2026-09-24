const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeBankRows,
  seal,
  unseal,
  safeDescription,
  bankAvailability,
} = require("../lib/bank-private");
const { syncfyRequest } = require("../lib/banking");
const config = { bankDataKey: "ab".repeat(32) };
test("bank review encryption binds ciphertext to user/mode/draft and rejects tampering", () => {
  const sealed = seal(
    { amount: 100, note: "private" },
    config,
    "user:live:draft",
  );
  assert.equal(JSON.stringify(sealed).includes("private"), false);
  assert.equal(unseal(sealed, config, "user:live:draft").amount, 100);
  assert.throws(() => unseal(sealed, config, "other:live:draft"));
  assert.throws(() =>
    unseal(
      { ...sealed, tag: Buffer.alloc(16).toString("base64") },
      config,
      "user:live:draft",
    ),
  );
  assert.throws(() => seal({}, {}, "context"));
});
test("bank mapping rejects pending, foreign, invalid and out of range data without guessing transaction type", () => {
  const base = {
    id_transaction: "txn",
    id_account: "mine",
    amount: -150.25,
    currency: "MXN",
    is_pending: 0,
    dt_transaction: Date.parse("2026-09-24T12:00:00Z") / 1000,
    description: "Pago 1234567890123456 mail@example.test",
  };
  const invalid = [
    { is_pending: 1 },
    { is_pending: undefined },
    { is_deleted: 1 },
    { currency: "USD" },
    { id_account: "other" },
    { amount: NaN },
    { amount: 0 },
    { dt_transaction: Infinity },
    { dt_transaction: Date.parse("2026-10-24") / 1000 },
    { id_transaction: "../bad" },
  ];
  const out = normalizeBankRows(
    [base, base, ...invalid.map((p) => ({ ...base, ...p }))],
    "mine",
    "uid",
    "2026-09-01",
    "2026-09-24",
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].amount, 150.25);
  assert.equal(out[0].direction, "cargo");
  assert.equal(out[0].type, undefined);
  assert.ok(!out[0].description.includes("1234567890123456"));
  assert.ok(!out[0].description.includes("@"));
  assert.notEqual(
    out[0].id,
    normalizeBankRows([base], "mine", "other", "2026-09-01", "2026-09-24")[0]
      .id,
  );
  assert.equal(safeDescription("x".repeat(300)).length, 180);
});
test("provider errors expose no raw credentials, payload or redirect; sandbox catalog never enables live", async () => {
  const original = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.equal(options.redirect, "error");
      return {
        ok: false,
        json: async () => ({ status: false, message: "SECRET" }),
      };
    };
    await assert.rejects(
      syncfyRequest("/accounts", { token: "SECRET" }),
      (e) => !e.message.includes("SECRET"),
    );
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        status: true,
        response: [
          { name: "BBVA Personal (Sandbox)", is_personal: 1, id_site: "test" },
        ],
      }),
    });
    const a = await bankAvailability({
      syncfyKey: "fake",
      syncfyLiveEnabled: true,
    });
    assert.equal(a.liveEnabled, false);
    assert.equal(a.sandbox.length, 1);
  } finally {
    global.fetch = original;
  }
});
