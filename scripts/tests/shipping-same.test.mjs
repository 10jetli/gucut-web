import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "netlify/lib/core-sync.mjs"), "utf8")
  .replace(/^import .*;\n/gm, "")
  .replace(/export /g, "");

const order = {
  number: "SO-FIXTURE", saleschannel: "web", status: "success", amount: 100,
  customername: "fixture", orderdateString: "2026-09-12", trackingno: "TRK-1",
  shippingchannel: "Flash", shippingname: "ผู้รับ", shippingdateString: "2026-09-12T08:00:00",
  isCOD: true, paymentstatus: "paid", integrationStatus: "done",
  discountamount: 0, shippingamount: 0, list: [],
};

function mirror(overrides = {}) {
  return {
    id: "z1/SO-FIXTURE", channel: "web", status: "success", amount: 100,
    customer: "fixture", order_date: "2026-09-12", tracking_no: "TRK-1",
    ship_channel: "Flash", ship_name: "ผู้รับ", ship_date: "2026-09-12", is_cod: 1,
    pay_status: "paid", integration_status: "done", bill_discount: 0, ship_amount: 0,
    ...overrides,
  };
}

async function run(previous) {
  const syncOrders = new Function("process", "fetch", "coreReady", "coreQuery", "getStore", `${source}\nreturn syncOrders;`)(
    { env: { ZORT_STORENAME: "fixture", ZORT_APIKEY: "fixture", ZORT_APISECRET: "fixture" } },
    async () => ({ ok: true, json: async () => ({ list: [order] }) }),
    () => true,
    async (sql) => sql.includes("SELECT id, channel") ? [previous] : [],
    () => ({ get: async () => null }),
  );
  return syncOrders(1, { from: "2026-09-12", to: "2026-09-12" });
}

test("same(): สี่ฟิลด์ขนส่งตรงกันจึงข้ามได้", async () => {
  const result = await run(mirror());
  assert.equal(result.stores.z1.written, 0);
  assert.equal(result.stores.z1.skipped, 1);
});

for (const [field, previous] of [
  ["ship_channel", mirror({ ship_channel: "Kerry" })],
  ["ship_name", mirror({ ship_name: "ชื่อเก่า" })],
  ["ship_date", mirror({ ship_date: "" })],
  ["is_cod", mirror({ is_cod: 0 })],
]) {
  test(`same(): ${field} เปลี่ยนลำพังต้องเข้า write`, async () => {
    const result = await run(previous);
    assert.equal(result.stores.z1.written, 1);
    assert.equal(result.stores.z1.skipped, 0);
  });
}
