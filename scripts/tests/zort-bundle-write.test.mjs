// ด่านเส้นเขียนสินค้าชุด — ใบ t_mv4he1qr (bundle-delete) + t_mv4hthvf (bundle-edit ของคุณส้ม)
// 🔑 ทดสอบ **เฉพาะด่านก่อนถึง ZORT** โดยตั้งใจ: ไม่ตั้งรหัส ZORT ⇒ โค้ดไปไม่ถึง network เลย
//    (ZORT ไม่มี sandbox · ยิงจริงคือแตะสต็อก/สูตรชุดของร้าน ⇒ ห้ามให้เทสยิง)
// 📏 ส่วน "เส้นของ ZORT มีจริงไหม" พิสูจน์แยกด้วย zort-probe.sh (GET เท่านั้น) 12 ต.ค. 2569:
//    Bundle/UpdateBundle → 405 · Bundle/DeleteBundle → 405 · ตัวควบคุมลบ Bundle/EditBundleXyz → 404
import assert from 'node:assert/strict';
import { test } from 'node:test';
delete process.env.ZORT_STORENAME; delete process.env.ZORT_APIKEY; delete process.env.ZORT_APISECRET;
const { zortUpdateBundle, zortDeleteBundle } = await import('../../netlify/lib/zort-write.mjs');

test('ด่านก่อนถึง ZORT: ref · id · sku · ช่องว่าง', async () => {
  assert.match((await zortUpdateBundle({})).error, /ref/);
  assert.match((await zortUpdateBundle({ ref: 'r1' })).error, /id.*sku|sku.*id/s);
  assert.match((await zortUpdateBundle({ ref: 'r1', id: 804372, sku: 'A' })).error, /ไม่มีช่องให้แก้/);
  assert.match((await zortDeleteBundle({ ref: 'r1', id: 804372 })).error, /sku/);
});

test('ค่าผิดรูปต้องตีกลับก่อนถึง ZORT', async () => {
  const b = { ref: 'r1', id: 804372, sku: 'A' };
  assert.match((await zortUpdateBundle({ ...b, price: -5 })).error, /ไม่ติดลบ/);
  assert.match((await zortUpdateBundle({ ...b, name: '' })).error, /ว่างไม่ได้|ไม่มีช่อง/);
  assert.match((await zortUpdateBundle({ ...b, items: [] })).error, /อย่างน้อย 1/);
  assert.match((await zortUpdateBundle({ ...b, items: [{ sku: 'A', qty: 1 }] })).error, /ใส่ตัวเองเป็นส่วนประกอบไม่ได้/);
  assert.match((await zortUpdateBundle({ ...b, items: [{ sku: 'X', qty: 0 }] })).error, /มากกว่า 0/);
  assert.match((await zortUpdateBundle({ ...b, items: [{ qty: 2 }] })).error, /ไม่มี sku/);
});

test('🔑 ไม่มีรหัส ZORT ⇒ ต้องตอบ "ยังไม่ได้ตั้งรหัส" และ **ห้ามบอกว่าสำเร็จ**', async () => {
  const b = { ref: 'r1', id: 804372, sku: 'A', price: 100 };
  const u = await zortUpdateBundle(b);
  assert.equal(u.ok, false);
  assert.ok(u.unknown, 'อ่านของจริงไม่ได้ = ไม่รู้ ไม่ใช่ไม่ผ่าน (three-states-not-two)');
  const d = await zortDeleteBundle({ ref: 'r2', id: 804372, sku: 'A' });
  assert.equal(d.ok, false);
  assert.ok(!d.dryRun, 'ยืนยันตัวตนไม่ได้ ⇒ ห้ามคืนใบซ้อมที่ดูเหมือนพร้อมกด');
});
