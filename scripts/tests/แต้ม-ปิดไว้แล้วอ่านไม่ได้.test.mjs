// รัน: node --experimental-test-module-mocks --test "scripts/tests/แต้ม-ปิดไว้แล้วอ่านไม่ได้.test.mjs"
// t_musleri9 · B18 — **ไฟล์นี้มีไว้เพื่อเทียบรุ่นโดยเฉพาะ**
//
// 🔑 มันนำเข้า **เฉพาะ `readLoyalty`** ซึ่งมีอยู่ทั้งในโค้ดเดิมและตัวแก้
//    ⇒ รันได้ทั้งสองรุ่น ⇒ ผลที่ต่างกันจึงเป็นหลักฐานว่า **พฤติกรรมเปลี่ยน** ไม่ใช่แค่สัญญาเปลี่ยน
// ⚠️ เทสอีกไฟล์ (`แต้มกับโค้ด-อ่านไม่ได้ห้ามแจกฟรี`) นำเข้าชื่อใหม่ ⇒ โหลดบนโค้ดเดิมไม่ได้
//    จึงใช้เป็นหลักฐานเทียบรุ่นไม่ได้ — แยกออกมาเพื่อไม่ให้ปนกัน
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const data = new Map();
const state = { failGet: null };
const fakeStore = {
  get: async (key) => {
    if (state.failGet && String(key).startsWith(state.failGet)) throw new Error('blobs อ่านล้มจำลอง');
    return data.has(key) ? structuredClone(data.get(key)) : null;
  },
  setJSON: async (key, value) => data.set(key, structuredClone(value)),
  delete: async (key) => data.delete(key),
  list: async ({ prefix }) => ({ blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
};
mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });

const { readLoyalty } = await import('../../netlify/lib/points.mjs');
const reset = () => { data.clear(); state.failGet = null; };

test('🔑 ร้านปิดระบบแต้มไว้ + อ่านไม่ได้ ⇒ ห้ามได้คำตอบเหมือนตอนเปิดอยู่จริง', async () => {
  reset();
  data.set('loyalty', { on: true, earnPer: 100 });
  const เปิดจริง = JSON.stringify(await readLoyalty());

  reset();
  data.set('loyalty', { on: false });
  state.failGet = 'loyalty';
  const ปิดแต่อ่านไม่ได้ = JSON.stringify(await readLoyalty());

  assert.notEqual(
    ปิดแต่อ่านไม่ได้, เปิดจริง,
    'สองสถานการณ์นี้ให้คำตอบ **เหมือนกันทุกตัวอักษร** ⇒ ระบบแยกไม่ได้ว่าร้านเปิดแต้มอยู่จริง\n'
    + '    หรือแค่อ่านกติกาไม่ได้ ⇒ แจกแต้มและให้ส่วนลดในวันที่ร้านสั่งปิดไปแล้ว\n'
    + `    ทั้งสองได้: ${เปิดจริง}`,
  );
});

test('ตัวควบคุมลบ: อ่านได้ปกติ ⇒ เปิดจริงกับปิดจริงต้องตอบต่างกัน (เทสไม่ได้ตอบ notEqual ทุกครั้ง)', async () => {
  reset();
  data.set('loyalty', { on: true });
  const เปิด = JSON.stringify(await readLoyalty());
  reset();
  data.set('loyalty', { on: false });
  const ปิด = JSON.stringify(await readLoyalty());
  assert.notEqual(เปิด, ปิด);
});

test('ตัวควบคุมลบ: เปิดจริงสองรอบ ⇒ ต้องตอบ **เหมือนกัน** (ยืนยันว่า notEqual ข้างบนมีความหมาย)', async () => {
  reset();
  data.set('loyalty', { on: true, earnPer: 100 });
  const ก = JSON.stringify(await readLoyalty());
  const ข = JSON.stringify(await readLoyalty());
  assert.equal(ก, ข, 'ถ้าข้อนี้ตก แปลว่าคำตอบมีค่าที่เปลี่ยนทุกครั้ง ⇒ notEqual ข้างบนไม่ได้พิสูจน์อะไร');
});
