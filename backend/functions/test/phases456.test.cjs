const { test } = require("node:test");
const assert = require("node:assert/strict");
const { reconcileReceipt, ruleKey } = require("../lib/receipts");
const { compareStores } = require("../lib/catalog");
const {
  locationSchema,
  distanceKm,
  locationNames,
} = require("../lib/location");
test("receipt split reconciles line totals without double counting the receipt", () => {
  const r = {
    warning: "",
    movements: [{ date: "2026-09-24", amount: 150 }],
    receipt: {
      merchant: "Test",
      total: 150,
      items: [
        { name: "Food", quantity: 2, amount: 100, category: "Alimentación" },
        { name: "Medicine", quantity: 1, amount: 50, category: "Salud" },
      ],
    },
  };
  const result = reconcileReceipt(r, "ticket", "2026-09-24");
  assert.equal(result.movements.length, 2);
  assert.equal(
    result.movements.reduce((n, m) => n + m.amount, 0),
    150,
  );
  r.receipt.total = 140;
  const failed = reconcileReceipt(r, "ticket", "2026-09-24");
  assert.equal(failed.movements.length, 1);
  assert.equal(failed.movements[0].amount, 140);
  assert.equal(failed.movements[0].category, "Otros");
  assert.match(failed.warning, /descuentos/);
  assert.equal(ruleKey("  CAFÉ  prueba "), ruleKey("cafe prueba"));
});
test("four branches compare identical products, missing prices never become zero", () => {
  const stores = Array.from({ length: 5 }, (_, i) => ({
    id: "s" + i,
    name: "Branch " + i,
    address: "Test",
    municipality: "Test",
  }));
  const items = [
    { id: "p1", name: "Product", quantity: 2 },
    { id: "p2", name: "Other", quantity: 1 },
  ];
  const prices = stores.flatMap((s, i) => [
    {
      productId: "p1",
      storeId: s.id,
      price: 10 + i,
      date: "2026-09-23",
      source: "test",
    },
    ...(i === 0
      ? []
      : [
          {
            productId: "p2",
            storeId: s.id,
            price: 5,
            date: "2026-09-23",
            source: "test",
          },
        ]),
  ]);
  const r = compareStores(items, stores, prices, {}, "2026-09-24");
  assert.equal(r.length, 4);
  assert.equal(r[0].total, 27);
  assert.equal(
    r.some((s) => s.id === "s0"),
    false,
  );
  const incomplete = compareStores(
    items,
    [stores[0]],
    prices,
    {},
    "2026-09-24",
  )[0];
  assert.equal(incomplete.total, null);
  assert.equal(incomplete.subtotal, 20);
  assert.equal(incomplete.missingCount, 1);
});
test("expired and future prices are excluded unless history is explicitly selected; future never allowed", () => {
  const store = {
    id: "s",
    name: "Test",
    municipality: "Test",
    address: "Test",
  };
  const items = [{ id: "p", name: "Test", quantity: 1 }];
  const old = [
    {
      productId: "p",
      storeId: "s",
      price: 20,
      date: "2026-07-31",
      source: "PROFECO",
    },
  ];
  assert.equal(
    compareStores(items, [store], old, {}, "2026-09-24")[0].total,
    null,
  );
  assert.equal(
    compareStores(items, [store], old, {}, "2026-09-24", true)[0].historical,
    true,
  );
  old[0].date = "2026-12-01";
  assert.equal(
    compareStores(items, [store], old, {}, "2026-09-24", true)[0].total,
    null,
  );
});
test("location requires paired valid coordinates; unknown and far locations cannot rank as nearby", () => {
  assert.equal(
    locationSchema.safeParse({ municipality: "Monterrey", latitude: 25 })
      .success,
    false,
  );
  assert.equal(
    distanceKm(
      { latitude: 25, longitude: -100 },
      { latitude: 25, longitude: -100 },
    ),
    0,
  );
  const stores = [
    { id: "a", name: "Unknown" },
    { id: "b", name: "Far", latitude: 19, longitude: -99 },
  ];
  assert.equal(
    compareStores(
      [],
      stores,
      [],
      { latitude: 25, longitude: -100 },
      "2026-09-24",
    ).length,
    0,
  );
});
test("reverse location favors the administrative municipality and supports locality fallbacks", () => {
  assert.deepEqual(
    locationNames({
      city: "San Pedro Garza García",
      municipality: "San Pedro Garza García",
      state: "Nuevo León",
    }),
    { municipality: "San Pedro Garza García", state: "Nuevo León" },
  );
  assert.deepEqual(locationNames({ town: "Tulum", state: "Quintana Roo" }), {
    municipality: "Tulum",
    state: "Quintana Roo",
  });
});
