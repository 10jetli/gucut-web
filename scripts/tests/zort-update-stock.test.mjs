// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-update-stock.test.mjs
// เส้นเขียน "จำนวน" ลง ZORT (?updatestock=1) — คุณส้มขอมา 10 ต.ค. 2569 เพราะท่อไม่มีเส้นนี้เลยสักเส้น
// ⚠️ ZORT ในเทสนี้เป็นของปลอมทั้งหมด ไม่ยิงเน็ตจริง · ไม่มีจำนวนของร้านถูกแตะแม้แถวเดียว
//
// 🔑 ข้อที่เทสนี้มีไว้จับเป็นหลัก (ไม่ใช่ "เรียกแล้วไม่พัง"):
//    ① เขียนช่องผิด — คงเหลือ (stock) กับ พร้อมขาย (availablestock) คนละค่ากันจริง
//       (วัดของจริง 10 ต.ค. 2569 · Bar NW 16: คงเหลือ 4 · พร้อมขาย 0)
//    ② สรุป set/add จากตัวควบคุมที่แยกแยะไม่ได้ — ของตั้งต้น 0 ทำให้ 0+7 กับ set 7 ให้เลขเดียวกัน
//       ⇒ มี **ตัวควบคุมลบ** ในเทสนี้: ปลอมให้ ZORT ทำงานแบบ add แล้วคำตอบต้อง **ห้าม** บอกว่า set
//    ③ เชื่อ 200 ลอย ๆ — คำตอบต้องมีเลขที่อ่านกลับมาติดมาด้วยเสมอ
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

const blob = new Map();
mock.module('@netlify/blobs', { namedExports: { getStore: () => ({
  get: async (k) => (blob.has(k) ? blob.get(k) : null),
  setJSON: async (k, v) => { blob.set(k, v); },
}) } });

/* ZORT ปลอม: ทะเบียนสินค้า + พฤติกรรมตอนถูกเขียน (set | add | none) */
let คลัง = {};
let พฤติกรรม = 'set';     // ZORT จะตีความค่าที่ส่งไปแบบไหน — ตัวแปรที่ทำให้เทสนี้แยกแยะได้
let อ่านพัง = false;
let รหัสผล = '200';
let calls = [];

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  calls.push({ url: u, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
  if (u.includes('GetProducts')) {
    if (อ่านพัง) throw new Error('network down');
    const sku = decodeURIComponent(new URL(u).searchParams.get('searchsku') || '');
    const p = คลัง[sku];
    return { ok: true, status: 200, json: async () => ({ list: p ? [{ id: p.id, sku, name: 'ของทดสอบ',
      sellprice: 1, purchaseprice: 1, stock: p.stock, availablestock: p.availablestock, unittext: 'PCS' }] : [] }) };
  }
  if (u.includes('UpdateProductStockList') || u.includes('UpdateProductAvailableStockList')) {
    const ช่อง = u.includes('AvailableStock') ? 'availablestock' : 'stock';
    if (รหัสผล === '200') {
      for (const row of JSON.parse(init.body).stocks) {
        const p = คลัง[row.sku];
        if (!p) continue;
        if (พฤติกรรม === 'set') p[ช่อง] = row.stock;
        else if (พฤติกรรม === 'add') p[ช่อง] = p[ช่อง] + row.stock;
      }
    }
    return { ok: true, status: 200, json: async () => ({ res: { resCode: รหัสผล, resDesc: 'ผลปลอม' } }) };
  }
  return { ok: true, status: 200, json: async () => ({ res: { resCode: '200' } }) };
};

const posts = () => calls.filter((c) => c.method === 'POST');
const เขียน = () => posts().filter((c) => /UpdateProduct(Available)?StockList/.test(c.url));
const ตั้งรหัส = () => { process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x'; };
const ถอดรหัส = () => { delete process.env.ZORT_STORENAME; delete process.env.ZORT_APIKEY; delete process.env.ZORT_APISECRET; };
const ตั้งต้น = () => {
  calls = []; อ่านพัง = false; รหัสผล = '200'; พฤติกรรม = 'set';
  คลัง = { 'Bar NW 16': { id: 20942809, stock: 4, availablestock: 0 }, 'A1': { id: 11, stock: 10, availablestock: 10 } };
  ตั้งรหัส();
};

const { zortUpdateProductStock } = await import('../../netlify/lib/zort-write.mjs');

test('ด่านก่อนถึง ZORT — ไม่มีคำสั่งไหนหลุดไปยิงเน็ต', async () => {
  ตั้งต้น();
  const base = { ref: 'S-1', field: 'stock', warehousecode: 'NEW', stocks: [{ sku: 'A1', stock: 1 }] };
  assert.match((await zortUpdateProductStock({ ...base, ref: '' })).error, /ref/);
  // 🔑 ไม่ส่ง field = ตีกลับ **ห้ามเดาให้ช่องใดช่องหนึ่ง**
  assert.match((await zortUpdateProductStock({ ...base, field: undefined })).error, /field/);
  assert.match((await zortUpdateProductStock({ ...base, field: 'both' })).error, /field/);
  assert.match((await zortUpdateProductStock({ ...base, warehousecode: '' })).error, /warehousecode/);
  assert.match((await zortUpdateProductStock({ ...base, stocks: [] })).error, /stocks/);
  assert.match((await zortUpdateProductStock({ ...base, stocks: [{ sku: '', stock: 1 }] })).error, /sku/);
  assert.match((await zortUpdateProductStock({ ...base, stocks: [{ sku: 'A1', stock: -1 }] })).error, /ติดลบ/);
  assert.match((await zortUpdateProductStock({ ...base, stocks: [{ sku: 'A1', stock: 'ว่าง' }] })).error, /อ่านจำนวนไม่ออก/);
  assert.match((await zortUpdateProductStock({ ...base, stocks: [{ sku: 'A1', stock: 1 }, { sku: 'A1', stock: 2 }] })).error, /ซ้ำ/);
  // 🚫 ขอบเขตรอบนี้คือสต็อกอย่างเดียว (ท่านประธานสั่ง) ⇒ cost ต้องถูกตีกลับ ไม่ใช่ส่งต่อไป ZORT
  assert.match((await zortUpdateProductStock({ ...base, stocks: [{ sku: 'A1', stock: 1, cost: 5 }] })).error, /cost/);
  const เกิน = Array.from({ length: 6 }, (_, i) => ({ sku: `S${i}`, stock: 1 }));
  assert.match((await zortUpdateProductStock({ ...base, stocks: เกิน })).error, /5 รหัส/);
  assert.equal(เขียน().length, 0);
});

test('โหมดซ้อม: อ่านค่าก่อนให้ดู · ประกอบ path+body ตามเอกสาร · **ไม่เขียนอะไรเลย**', async () => {
  ตั้งต้น();
  const r = await zortUpdateProductStock({ ref: 'S-DRY', field: 'available', warehousecode: 'NEW',
    stocks: [{ sku: 'Bar NW 16', stock: 4 }] });
  assert.equal(r.dryRun, true);
  assert.equal(r.willSend.path, 'Product/UpdateProductAvailableStockList?warehousecode=NEW');
  assert.deepEqual(r.willSend.body, { stocks: [{ sku: 'Bar NW 16', stock: 4 }] });
  // ค่าก่อนเขียนต้องติดมาด้วย — คนเรียกต้องเห็นว่าของตั้งต้นเป็น 0 (⇒ รอบนี้แยก set/add ไม่ออก)
  assert.deepEqual(r.before['Bar NW 16'], { stock: 4, availablestock: 0 });
  assert.equal(เขียน().length, 0);
  assert.equal(คลัง['Bar NW 16'].availablestock, 0);
});

test('🔴 เลือกช่องผิดไม่ได้: field "stock" กับ "available" ยิงคนละเส้นและขยับคนละค่า', async () => {
  ตั้งต้น();
  await zortUpdateProductStock({ ref: 'S-F1', field: 'stock', warehousecode: 'NEW',
    stocks: [{ sku: 'A1', stock: 7 }], confirm: true });
  assert.equal(คลัง.A1.stock, 7);
  assert.equal(คลัง.A1.availablestock, 10, 'เขียนช่องคงเหลือ ต้องไม่แตะช่องพร้อมขาย');
  assert.ok(เขียน().every((c) => c.url.includes('UpdateProductStockList')));

  ตั้งต้น();
  await zortUpdateProductStock({ ref: 'S-F2', field: 'available', warehousecode: 'NEW',
    stocks: [{ sku: 'A1', stock: 3 }], confirm: true });
  assert.equal(คลัง.A1.availablestock, 3);
  assert.equal(คลัง.A1.stock, 10, 'เขียนช่องพร้อมขาย ต้องไม่แตะช่องคงเหลือ');
  assert.ok(เขียน().every((c) => c.url.includes('UpdateProductAvailableStockList')));
});

test('🔑 อ่านกลับหลังเขียนและคืนเลขมาด้วย ⇒ ผู้เรียกเชื่อ 200 ลอย ๆ ไม่ได้', async () => {
  ตั้งต้น();
  const r = await zortUpdateProductStock({ ref: 'S-RB', field: 'stock', warehousecode: 'NEW',
    stocks: [{ sku: 'A1', stock: 7 }], confirm: true });
  assert.equal(r.ok, true);
  assert.equal(r.written, true);
  const row = r.rows.find((x) => x.sku === 'A1');
  assert.deepEqual([row.before, row.sent, row.after], [10, 7, 7]);
  assert.equal(row.อ่านกลับได้, true);
  assert.equal(row.ตรงกับที่ส่ง, true);
  assert.equal(r.readBackAll.A1.stock, 7);
  // availablestock เป็นค่าที่ ZORT คิดใหม่ได้ ⇒ ธงนี้ต้องติดมาทุกครั้ง ไม่ว่าเลขจะสวยแค่ไหน
  assert.equal(r.ต้องอ่านซ้ำภายหลัง, true);
  // ลำดับต้องเป็น อ่านก่อน → เขียน → อ่านกลับ
  const ลำดับ = calls.map((c) => (/StockList/.test(c.url) ? 'เขียน' : 'อ่าน'));
  assert.deepEqual(ลำดับ, ['อ่าน', 'เขียน', 'อ่าน']);
});

test('🔴 ตัวควบคุมลบของการตีความ set/add — ของตั้งต้น 0 ต้องตอบ "แยกไม่ออก" ห้ามตอบ set', async () => {
  // ของจริงที่รออยู่: Bar NW 16 พร้อมขาย = 0 ⇒ ถ้าเขียน 4 แล้วอ่านได้ 4 จะสรุปอะไรไม่ได้เลย
  ตั้งต้น(); พฤติกรรม = 'add';
  const r = await zortUpdateProductStock({ ref: 'S-Z0', field: 'available', warehousecode: 'NEW',
    stocks: [{ sku: 'Bar NW 16', stock: 4 }], confirm: true });
  const row = r.rows[0];
  assert.deepEqual([row.before, row.sent, row.after], [0, 4, 4]);
  assert.match(row.ตีความ, /แยกไม่ออก/);
  // ข้อความอธิบายมีคำว่า set/add อยู่ในเหตุผลได้ แต่ต้องไม่ **ชี้ขาด** ว่าเป็นอันไหน
  assert.doesNotMatch(row.ตีความ, /ดูเหมือน/);
});

test('ตีความ set/add ได้จริงเมื่อของตั้งต้นไม่ใช่ 0 — ทั้งสองทิศ', async () => {
  ตั้งต้น(); พฤติกรรม = 'set';
  const a = await zortUpdateProductStock({ ref: 'S-SET', field: 'stock', warehousecode: 'NEW',
    stocks: [{ sku: 'A1', stock: 7 }], confirm: true });
  assert.match(a.rows[0].ตีความ, /set/);

  ตั้งต้น(); พฤติกรรม = 'add';
  const b = await zortUpdateProductStock({ ref: 'S-ADD', field: 'stock', warehousecode: 'NEW',
    stocks: [{ sku: 'A1', stock: 7 }], confirm: true });
  assert.deepEqual([b.rows[0].before, b.rows[0].after], [10, 17]);
  assert.match(b.rows[0].ตีความ, /add/);

  ตั้งต้น(); พฤติกรรม = 'none';
  const c = await zortUpdateProductStock({ ref: 'S-NONE', field: 'stock', warehousecode: 'NEW',
    stocks: [{ sku: 'A1', stock: 7 }], confirm: true });
  assert.match(c.rows[0].ตีความ, /ไม่ขยับ/);
});

test('อ่านค่าก่อนเขียนไม่ได้ ⇒ ไม่เขียนอะไรเลย ("ไม่รู้" ≠ "ตรง") · รหัสที่ ZORT ไม่มี ก็ไม่เขียน', async () => {
  ตั้งต้น(); อ่านพัง = true;
  const r = await zortUpdateProductStock({ ref: 'S-UNK', field: 'stock', warehousecode: 'NEW',
    stocks: [{ sku: 'A1', stock: 1 }], confirm: true });
  assert.equal(r.ok, false);
  assert.equal(r.unknown, true);
  assert.equal(เขียน().length, 0);

  ตั้งต้น();
  const r2 = await zortUpdateProductStock({ ref: 'S-MISS', field: 'stock', warehousecode: 'NEW',
    stocks: [{ sku: 'A1', stock: 1 }, { sku: 'ไม่มีรหัสนี้', stock: 2 }], confirm: true });
  assert.equal(r2.ok, false);
  assert.match(r2.error, /ไม่มีรหัส/);
  assert.equal(เขียน().length, 0, 'มีแถวเดียวที่อ่านไม่ได้ ก็ต้องไม่เขียนทั้งคำสั่ง');
  assert.equal(คลัง.A1.stock, 10);
});

test('ZORT ปฏิเสธ (resCode ไม่ใช่ 200) ⇒ ไม่เขียว และ **ไม่จดกันซ้ำ** (กดปุ่มเดิมใหม่ได้)', async () => {
  ตั้งต้น(); รหัสผล = '100';
  const r = await zortUpdateProductStock({ ref: 'S-REJ', field: 'stock', warehousecode: 'NEW',
    stocks: [{ sku: 'A1', stock: 7 }], confirm: true });
  assert.equal(r.ok, false);
  assert.match(r.error, /ZORT ปฏิเสธ/);
  assert.ok(![...blob.keys()].some((k) => k.includes('S-REJ')));
});

test('กันยิงซ้ำ: ref เดิมส่งอีกครั้ง = duplicate ไม่ยิง ZORT ซ้ำ', async () => {
  ตั้งต้น();
  const ใบ = { ref: 'S-DUP', field: 'stock', warehousecode: 'NEW', stocks: [{ sku: 'A1', stock: 7 }], confirm: true };
  const a = await zortUpdateProductStock(ใบ);
  assert.equal(a.written, true);
  ตั้งต้น();
  const b = await zortUpdateProductStock(ใบ);
  assert.equal(b.duplicate, true);
  assert.equal(เขียน().length, 0);
  assert.equal(คลัง.A1.stock, 10, 'ของไม่ถูกเขียนรอบที่สอง');
});

test('ไม่ได้ตั้งรหัส ZORT ⇒ ตีกลับตั้งแต่อ่านค่าก่อน ไม่ไปถึงการเขียน', async () => {
  ตั้งต้น(); ถอดรหัส();
  const r = await zortUpdateProductStock({ ref: 'S-NOKEY', field: 'stock', warehousecode: 'NEW',
    stocks: [{ sku: 'A1', stock: 1 }], confirm: true });
  assert.equal(r.ok, false);
  assert.equal(เขียน().length, 0);
  ตั้งรหัส();
});

test('เส้น ?updatestock=1 ใน core.mjs รับ POST เท่านั้น และมีค่าตั้งต้นเป็นโหมดซ้อม', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const i = src.indexOf('url.searchParams.get("updatestock")');
  assert.ok(i > 0, 'ไม่เจอเส้น ?updatestock= ใน core.mjs');
  const ท่อน = src.slice(i, i + 500);
  assert.match(ท่อน, /req\.method !== "POST"/);
  assert.match(ท่อน, /zortUpdateProductStock/);
  // ไม่มีการเติม confirm ให้เองในท่อ — ต้องมาจากผู้เรียกเท่านั้น
  assert.doesNotMatch(ท่อน, /confirm:\s*true/);
});
