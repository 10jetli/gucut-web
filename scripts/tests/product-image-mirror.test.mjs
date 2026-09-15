// รัน: node --experimental-test-module-mocks --test scripts/tests/product-image-mirror.test.mjs
// 15 ก.ย. 2569 · ใบ t_mu2utot5 — รับรูปย่อจาก g1 เข้า R2 + products.image_file
// 🔴 สิ่งที่เฝ้า: ① ไม่ใช่ webp จริง = ปฏิเสธ ก่อนแตะถัง ② ขาดขั้น = ปฏิเสธ ③ source ไม่ตรง image_path = ปฏิเสธ
//    ④ อัปครบทุกขั้นก่อนบันทึกชื่อ ⑤ list=stock ส่ง imageFile เฉพาะที่ย่อจากรูปปัจจุบัน
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

let row = { sku: 'A', image_path: 'https://img.example/a.png' };
const puts = [];
const sqls = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreQuery: async (sql, params = []) => { sqls.push({ sql: String(sql), params, putsSoFar: puts.length }); return /^\s*SELECT/.test(sql) ? (row ? [row] : []) : []; },
} });
mock.module('../../netlify/lib/r2.mjs', { namedExports: {
  r2Ready: () => true,
  r2Put: async (key, buf, type) => { puts.push({ key, len: buf.length, type }); },
} });
const { saveMirroredImage, isWebp, mirrorName, LADDER } = await import('../../netlify/lib/product-image-mirror.mjs');

const webp = () => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(20)]).toString('base64');
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(30)]).toString('base64');
const all = () => Object.fromEntries(LADDER.map((s) => [s, webp()]));

test('isWebp ดูหัวไฟล์จริง', () => {
  assert.equal(isWebp(Buffer.from(webp(), 'base64')), true);
  assert.equal(isWebp(Buffer.from(png, 'base64')), false);
});

test('ครบ 4 ขั้น + source ตรง ⇒ อัปทุกขั้นก่อน แล้วค่อยบันทึกชื่อ', async () => {
  puts.length = 0; sqls.length = 0;
  const r = await saveMirroredImage({ sku: 'A', source: 'https://img.example/a.png', files: all() });
  assert.equal(r.ok, true);
  assert.equal(r.file, mirrorName('A', 'https://img.example/a.png'));
  assert.deepEqual(puts.map((p) => p.key), LADDER.map((s) => `i/${s}/${r.file}`));
  assert.ok(puts.every((p) => p.type === 'image/webp'));
  const upd = sqls.find((q) => /UPDATE products SET image_file/.test(q.sql));
  assert.ok(upd); assert.equal(upd.putsSoFar, LADDER.length, 'ต้องบันทึกหลังอัปครบ');
  assert.deepEqual(upd.params, [r.file, 'https://img.example/a.png', 'A', 'https://img.example/a.png']);
});

test('ไม่ใช่ webp · ขาดขั้น · ขั้นแปลก ⇒ ปฏิเสธ ไม่แตะถัง', async () => {
  puts.length = 0;
  assert.equal((await saveMirroredImage({ sku: 'A', source: 'https://img.example/a.png', files: { ...all(), 256: png } })).ok, false);
  const f = all(); delete f[640];
  assert.match((await saveMirroredImage({ sku: 'A', source: 'https://img.example/a.png', files: f })).error, /ขาดรูปขั้น 640/);
  assert.match((await saveMirroredImage({ sku: 'A', source: 'https://img.example/a.png', files: { ...all(), 999: webp() } })).error, /ขั้นที่ไม่รู้จัก/);
  assert.equal(puts.length, 0);
});

test('source ไม่ตรง image_path · ไม่มี sku ⇒ ปฏิเสธ ไม่แตะถัง', async () => {
  puts.length = 0;
  assert.match((await saveMirroredImage({ sku: 'A', source: 'https://evil.example/x.png', files: all() })).error, /ไม่ตรง image_path/);
  row = null;
  assert.match((await saveMirroredImage({ sku: 'A', source: 'https://img.example/a.png', files: all() })).error, /ไม่มี sku/);
  row = { sku: 'A', image_path: 'https://img.example/a.png' };
  assert.equal(puts.length, 0);
});

test('list=stock ส่ง imageFile เฉพาะที่ย่อจากรูปปัจจุบัน · core.mjs ต้องเป็น POST', () => {
  const st = readFileSync(new URL('../../netlify/lib/core-stock.mjs', import.meta.url), 'utf8');
  assert.match(st, /CASE WHEN p\.image_file_src = p\.image_path THEN p\.image_file ELSE NULL END AS imageFile/);
  const core = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const i = core.indexOf('searchParams.get("imgmirror")');
  assert.ok(i > 0);
  assert.match(core.slice(i, i + 200), /if \(req\.method !== "POST"\) return json\(\{ error: "ต้องเป็น POST" \}, 405\);/);
});
