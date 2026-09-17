// รัน: node --experimental-test-module-mocks --test scripts/tests/lazada-push-chunk.test.mjs
// 🔴 ยิงจริง 17 ก.ย. 2569 14:01 — Lazada ปฏิเสธทั้ง 76 ด้วย
//    `4171: The updated SKU quantity exceeds the maximum number 50, please do not update more than 50 SKUs at once`
//    ของเดิมส่งทั้งก้อนในคำขอเดียว ⇒ ชุดนี้จำลอง Lazada ที่ปฏิเสธคำขอเกิน 50 แบบเดียวกับของจริง
//    ⚠️ พิสูจน์แล้วว่าจับบั๊กได้: รันกับโค้ดก่อนแก้ ได้ 1 คำขอ 76 ตัว ถูกปฏิเสธ 76 (ตรงอาการจริง)
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('../../netlify/lib/lazada.mjs', { namedExports: {
  sign: () => 'x',
  validToken: async () => ({ accessToken: 't' }),
  skuIdMap: async () => new Map(Array.from({ length: 200 }, (_, i) => [`S${i}`, { skuId: `id${i}`, itemId: `it${i}` }])),
} });
process.env.LAZADA_APP_KEY = 'k';

let คำขอ = [];
let ปฏิเสธก้อนที่ = -1;
globalThis.fetch = async (_url, opt) => {
  const n = JSON.parse(new URLSearchParams(opt.body).get('payload')).Request.Product.Skus.Sku.length;
  คำขอ.push(n);
  const body = n > 50 ? { code: '4171', message: 'exceeds the maximum number 50' }
    : คำขอ.length - 1 === ปฏิเสธก้อนที่ ? { code: '500', message: 'จำลองก้อนเดียวพัง' }
    : { code: '0' };
  return { status: 200, json: async () => body };
};

const { lazadaPush, แบ่งก้อน, LAZADA_SKU_ต่อคำขอ, LAZADA_SKU_เพดาน } = await import('../../netlify/lib/stock-push-live.mjs');
const แถว = (n) => Array.from({ length: n }, (_, i) => ({ sku: `S${i}`, from: 1, to: 2, kind: 'up' }));
const นับ = (ผล) => ผล.reduce((a, r) => ((a[r.result] = (a[r.result] || 0) + 1), a), {});

test('76 แถวแบบรอบจริง 14:01 ⇒ ทุกคำขอไม่เกินเพดาน และเข้าครบ 76', async () => {
  คำขอ = []; ปฏิเสธก้อนที่ = -1;
  const ผล = await lazadaPush(แถว(76));
  assert.ok(คำขอ.every((n) => n <= LAZADA_SKU_เพดาน), `มีคำขอเกินเพดาน: ${คำขอ}`);
  assert.equal(คำขอ.reduce((a, b) => a + b, 0), 76, 'ต้องยิงครบทุกตัว ไม่หล่น');
  assert.deepEqual(นับ(ผล), { pushed: 76 });
});

test('รหัสที่หา SkuId ไม่เจอ ⇒ not_sent พร้อมเหตุผล ไม่หายไปจากผล', async () => {
  คำขอ = []; ปฏิเสธก้อนที่ = -1;
  const ผล = await lazadaPush([...แถว(3), { sku: 'ไม่มีบนลาซาด้า', from: 1, to: 2, kind: 'up' }]);
  assert.equal(ผล.length, 4);
  assert.equal(ผล.find((r) => r.sku === 'ไม่มีบนลาซาด้า').result, 'not_sent');
});

test('ก้อนหนึ่งถูกปฏิเสธ ⇒ ก้อนอื่นยังยิงและเข้าได้ ไม่ล้มตามทั้งรอบ', async () => {
  คำขอ = []; ปฏิเสธก้อนที่ = 1;
  const ผล = await lazadaPush(แถว(60));
  assert.deepEqual(นับ(ผล), { pushed: 60 - LAZADA_SKU_ต่อคำขอ, rejected: LAZADA_SKU_ต่อคำขอ });
  assert.ok(ผล.filter((r) => r.result === 'rejected').every((r) => r.why), 'แถวที่ถูกปฏิเสธต้องมีเหตุผล');
});

test('แบ่งก้อนกันค่าที่ตั้งเกินเพดานของ Lazada ไว้เสมอ', () => {
  assert.deepEqual(แบ่งก้อน(Array(76).fill(0), 999).map((a) => a.length), [50, 26]);
  assert.deepEqual(แบ่งก้อน(Array(76).fill(0), 20).map((a) => a.length), [20, 20, 20, 16]);
});
