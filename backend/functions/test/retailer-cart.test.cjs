const { test } = require("node:test");
const assert = require("node:assert/strict");
const { prepareHebCart } = require("../lib/retailer-cart");
const now = Date.parse("2026-09-24T12:00:00Z"),
  stamp = new Date(now).toISOString();
const items = [
  { id: "p1", quantity: 2, selected: true },
  { id: "p2", quantity: 1, selected: true },
  { id: "p3", quantity: 1, selected: true },
];
const config = {
  enabled: true,
  verification: {
    status: "verified",
    checkedAt: stamp,
    salesChannel: "1",
    evidenceId: "fixture-only",
    quantitiesMatched: true,
    existingCartPreserved: true,
  },
};
const mappings = items.map((i, n) => ({
  productId: i.id,
  sku: String(100 + n),
  seller: "1",
  salesChannel: "1",
  productUrl: `https://www.heb.com.mx/fixture-${n}/p`,
  match: "exact",
  verifiedAt: stamp,
}));
test("retailer checkout is unavailable without actual verification, complete mappings and recent evidence", () => {
  assert.equal(prepareHebCart(items, mappings, undefined, now).ready, false);
  assert.equal(
    prepareHebCart(items, mappings, { ...config, enabled: false }, now).url,
    null,
  );
  assert.equal(
    prepareHebCart(
      items,
      mappings,
      {
        ...config,
        verification: { ...config.verification, status: "blocked" },
      },
      now,
    ).ready,
    false,
  );
  assert.equal(
    prepareHebCart(items, mappings, config, now + 8 * 86400000).ready,
    false,
  );
  assert.equal(
    prepareHebCart(items, mappings.slice(1), config, now).reason,
    "missing_mapping",
  );
  assert.equal(
    prepareHebCart(
      items,
      mappings.map((m) => ({ ...m, productUrl: "https://evil.example/p" })),
      config,
      now,
    ).ready,
    false,
  );
  assert.equal(
    prepareHebCart(
      items,
      mappings.map((m) => ({ ...m, salesChannel: "2" })),
      config,
      now,
    ).ready,
    false,
  );
});
test("verified link preserves paired SKU/quantity/seller, excludes unselected products and never contains checkout/payment credentials", () => {
  const r = prepareHebCart(
    [...items, { id: "ignored", quantity: 1, selected: false }],
    mappings,
    config,
    now,
  );
  assert.equal(r.ready, true);
  const u = new URL(r.url);
  assert.equal(u.origin, "https://www.heb.com.mx");
  assert.equal(u.pathname, "/checkout/cart/add");
  assert.deepEqual(u.searchParams.getAll("sku"), ["100", "101", "102"]);
  assert.deepEqual(u.searchParams.getAll("qty"), ["2", "1", "1"]);
  assert.deepEqual(u.searchParams.getAll("seller"), ["1", "1", "1"]);
  assert.equal(u.searchParams.get("redirect"), "true");
  assert.equal(u.searchParams.get("sc"), "1");
  for (const quantity of [0, 0.5, 100, Infinity])
    assert.equal(
      prepareHebCart([{ ...items[0], quantity }], mappings, config, now).ready,
      false,
    );
  assert.equal(
    prepareHebCart(
      items,
      mappings.map((m) => ({ ...m, sku: "100" })),
      config,
      now,
    ).reason,
    "ambiguous_mapping",
  );
  assert.equal(prepareHebCart([], [], config, now).reason, "empty");
});
