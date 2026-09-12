import assert from "node:assert/strict";
import {
  mirrorShippingFields,
  ordercheckCoverage,
  shippingFieldsChanged,
  zortShippingFields,
} from "../../netlify/lib/ordercheck-shipping.mjs";

const zort = {
  shippingchannel: "Flash",
  shippingname: "ผู้รับ",
  shippingdateString: "2026-09-12T08:00:00",
  isCOD: true,
};
const mirror = {
  ship_channel: "Flash",
  ship_name: "ผู้รับ",
  ship_date: "2026-09-12",
  is_cod: 1,
};

assert.deepEqual(zortShippingFields(zort), {
  shipChannel: "Flash", shipName: "ผู้รับ", shipDate: "2026-09-12", isCod: 1,
});
assert.deepEqual(mirrorShippingFields(mirror), {
  shipChannel: "Flash", shipName: "ผู้รับ", shipDate: "2026-09-12", isCod: 1,
});
assert.deepEqual(shippingFieldsChanged(zort, mirror), []);
assert.deepEqual(
  shippingFieldsChanged(zort, { ...mirror, ship_name: "เก่า", ship_date: "", is_cod: 0 }),
  ["shipName", "shipDate", "isCod"]
);

assert.deepEqual(ordercheckCoverage({ declaredTotal: 2, uniqueOrders: 2, rowsFetched: 2, truncated: false }), {
  zortDeclaredTotal: 2, zortRowsFetched: 2, zortUniqueOrders: 2, zortReadComplete: true,
});
assert.equal(ordercheckCoverage({ declaredTotal: 3, uniqueOrders: 2, rowsFetched: 2, truncated: false }).zortReadComplete, false);
assert.equal(ordercheckCoverage({ declaredTotal: null, uniqueOrders: 2, rowsFetched: 2, truncated: false }).zortReadComplete, null);
assert.equal(ordercheckCoverage({ declaredTotal: 2, uniqueOrders: 2, rowsFetched: 2, truncated: true }).zortReadComplete, false);

console.log("ordercheck shipping: ผ่านการเทียบ 4 ฟิลด์และสามสถานะความครบ");

// รันบล็อก route จริงด้วย I/O จำลอง: ไม่มีคีย์หรือการเรียกเครือข่าย
const { readFile } = await import('node:fs/promises');
const helpers = await import('../../netlify/lib/ordercheck-shipping.mjs');
const source = await readFile(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
const begin = source.indexOf('    if (url.searchParams.get("ordercheck")) {');
const end = source.indexOf('\n    /* ไขว้ช่องทาง', begin);
assert.ok(begin >= 0 && end > begin);
const block = source.slice(begin, end)
  .replace('await import("../lib/ordercheck-shipping.mjs")', 'helpers')
  .replace('await import("../lib/coredb.mjs")', '({ coreQuery: mockQuery })');
const route = new (Object.getPrototypeOf(async function(){}).constructor)(
  'url', 'fetch', 'mockQuery', 'process', 'json', 'helpers', block);
async function run(pages, mine, query = 'store=z2&from=2026-09-01&to=2026-09-12') {
  const requests = [];
  const result = await route(new URL(`https://local/api/core?ordercheck=1&${query}`),
    async (url, options) => {
      assert.equal(options.method ?? 'GET', 'GET');
      requests.push(url);
      const data = pages.shift();
      assert.ok(data);
      return { ok: true, json: async () => data };
    },
    async (sql, args) => {
      assert.match(sql, /ship_channel, ship_name, ship_date, is_cod/);
      assert.deepEqual(args, ['z2', '2026-09-01', '2026-09-12']);
      return mine;
    },
    { env: { ZORT_STORENAME: 'fixture', ZORT_STORENAME_2: 'fixture' } },
    (body, status = 200) => ({ body, status }), helpers);
  return { ...result, requests };
}
const order = (number) => ({ number, status: '2', paymentstatus: 'paid', integrationStatus: 'confirmed', ...zort });
const row = (number) => ({ number, status: '2', pay: 'paid', integ: 'confirmed', ...mirror });
const good = await run([{ count: 3, list: [order('a'), order('b'), order('c')] }],
  [{ ...row('a'), ship_date: '', ship_name: 'private-old-name' }, { ...row('b'), is_cod: 0 }, row('extra')]);
assert.equal(good.body.ok, true);
assert.equal(good.body.counts.staleShipping, 2);
assert.deepEqual(good.body.counts.shippingFields, { shipChannel: 0, shipName: 1, shipDate: 1, isCod: 1 });
assert.equal(good.body.counts.missingInMirror, 1);
assert.equal(good.body.counts.extraInMirror, 1);
assert.equal(good.body.coverage.matchedOrders, 2);
assert.ok(!JSON.stringify(good.body).includes('private-old-name'));
assert.ok(!JSON.stringify(good.body).includes('ผู้รับ'));
for (const page of [{ count: 3, list: [order('a')] }, { list: [order('a')] }, { count: 1, list: [order('a'), order('a')] }]) {
  const partial = await run([page], [row('a'), row('extra')]);
  assert.equal(partial.body.partial, true);
  assert.equal(partial.body.ok, false);
  assert.equal(partial.body.counts.extraInMirror, null);
  assert.deepEqual(partial.body.sample.extraInMirror, []);
}
const fullPage = Array.from({ length: 200 }, (_, i) => order(String(i)));
const moving = await run([{ count: 201, list: fullPage }, { count: 202, list: [order('200')] }], []);
assert.equal(moving.body.coverage.countStable, false);
assert.equal(moving.body.ok, false);
const capped = await run(Array.from({ length: 10 }, (_, p) => ({ count: 2001,
  list: Array.from({ length: 200 }, (_, i) => order(String(p * 200 + i))) })), []);
assert.equal(capped.body.truncated, true);
assert.equal(capped.requests.length, 10);
assert.equal(capped.body.counts.extraInMirror, null);
await assert.rejects(run([{ count: 0 }], []), /list/);
await assert.rejects(run([{ count: 1, list: [{}] }], []), /number/);
for (const query of ['store=typo', 'from=2026-02-30&to=2026-03-01', 'from=2026-01-01', 'days=90', 'from=2026-09-12&to=2026-09-01']) {
  const invalid = await run([], [], query);
  assert.equal(invalid.status, 400);
  assert.equal(invalid.requests.length, 0);
}
assert.deepEqual(helpers.validateOrdercheckWindow(new URLSearchParams('days=1'), Date.parse('2026-09-11T18:00:00Z')),
  { from: '2026-09-12', to: '2026-09-12', days: 1 });
console.log('ordercheck route: ผ่าน union, privacy, coverage, pagination, store/date และ schema ด้วย I/O จำลอง');
