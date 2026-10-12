// รัน: node --experimental-test-module-mocks --test "scripts/tests/แต้มรอ-ลบไม่สำเร็จห้ามบวกซ้ำ.test.mjs"
//
// 🔴 **รูที่เหลือจาก B03** (ปิด 12 ต.ค. 2569 · gucut2) — คนละทิศกับรากที่แก้ 14 ก.ย.
//    ราก = **แต้มหาย** (ลบยอดรอทั้งที่ไม่ได้บวก) · รูนี้ = **แต้มซ้ำ**
//    เส้นทาง: `addPoints` สำเร็จ → `usersStore.delete(pts/<เบอร์>)` ล้ม → `.catch(() => {})` กลืน
//    ⇒ ยอดรอยังอยู่ ⇒ ล็อกอินรอบถัดไปบวกให้อีกรอบ **ไม่มีอะไรฟ้อง**
//    ของสองก้อนนี้ไม่มีธุรกรรมร่วม ⇒ ปิดด้วยการลองใหม่ไม่ได้ ต้องปิดด้วยหลักฐานที่
//    ถูกเขียน **พร้อมกับ** การบวก คือบรรทัดในประวัติแต้มของบัญชีเดียวกัน
//
// ⚠️ เคสควบคุมในใบนี้มีสองทิศ ไม่ใช่ทิศเดียว:
//    · ควรจับ    = ลบยอดรอล้ม แล้วเรียกซ้ำ ⇒ ยอดต้องไม่ขยับ
//    · ต้องไม่จับ = คนละก้อน (เวลา/จำนวนต่างกัน) ⇒ ต้องบวกได้ตามปกติ
//      (ขาดทิศนี้ ตะแกรงที่กว้างเกินจะมองไม่เห็นเลย — ลูกค้าที่ได้แต้มรอสองรอบจะได้แค่รอบเดียว)
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const makeStore = () => {
  const data = new Map();
  const state = { ลบล้ม: false, deletes: [] };
  return {
    data, state,
    get: async (k) => (data.has(k) ? structuredClone(data.get(k)) : null),
    setJSON: async (k, v) => { data.set(k, structuredClone(v)); },
    delete: async (k) => {
      state.deletes.push(k);
      if (state.ลบล้ม) throw new Error('blobs ลบไม่สำเร็จจำลอง');
      data.delete(k);
    },
  };
};

mock.module('@netlify/blobs', { namedExports: { getStore: () => makeStore() } });
const { addPoints, claimPending } = await import('../../netlify/lib/points.mjs');

test('ควรจับ: ลบยอดรอล้มหลังบวกสำเร็จ ⇒ ล็อกอินรอบสองห้ามบวกซ้ำ', async () => {
  const s = makeStore();
  s.data.set('u/0812345678', { phone: '0812345678', points: 1200 });
  s.data.set('pts/0812345678', { n: 480, note: 'แต้มเดิมจาก CWILL', at: 1757800000000 });

  s.state.ลบล้ม = true;
  assert.equal(await claimPending(s, '0812345678'), 480, 'รอบแรกต้องโอนได้ 480');
  assert.equal(s.data.get('u/0812345678').points, 1680);
  assert.equal(s.data.has('pts/0812345678'), true, 'ลบล้ม ⇒ ยอดรอยังอยู่ (นี่คือสภาพที่ทำให้เคยบวกซ้ำ)');

  // รอบสอง: ยอดรอยังอยู่จริง ๆ — ของเดิมจะบวกอีก 480 เป็น 2160
  s.state.ลบล้ม = false;
  assert.equal(await claimPending(s, '0812345678'), 0, 'รอบสองต้องรายงานว่าโอน 0 ไม่ใช่ 480 อีกครั้ง');
  assert.equal(s.data.get('u/0812345678').points, 1680, 'ยอดห้ามขยับจาก 1680');
  assert.equal(s.data.has('pts/0812345678'), false, 'รอบสองลบได้แล้ว ⇒ ยอดรอต้องหมดไป');
  assert.equal(s.data.get('u/0812345678').pointLog.length, 1, 'ห้ามมีบรรทัดประวัติซ้ำ');
});

test('ต้องไม่จับ: ยอดรอก้อนใหม่ (เวลาต่างกัน) ⇒ ต้องบวกได้ตามปกติ', async () => {
  const s = makeStore();
  s.data.set('u/0899999999', { phone: '0899999999', points: 100 });
  s.data.set('pts/0899999999', { n: 50, note: 'ก้อนที่หนึ่ง', at: 1757800000000 });
  assert.equal(await claimPending(s, '0899999999'), 50);
  assert.equal(s.data.get('u/0899999999').points, 150);

  s.data.set('pts/0899999999', { n: 50, note: 'ก้อนที่สอง', at: 1757900000000 });
  assert.equal(await claimPending(s, '0899999999'), 50, 'ก้อนใหม่ต้องโอนได้ ห้ามถูกกันซ้ำ');
  assert.equal(s.data.get('u/0899999999').points, 200);
});

test('ต้องไม่จับ: เส้นได้แต้ม/หักแต้มของใบเดียวกัน ห้ามกันกันเอง', async () => {
  // 🔑 เหตุที่เคสนี้ต้องมี: `orders.mjs` ให้แต้มด้วย `o.id` และ `order-finalize.mjs`
  //    หักแต้มด้วย `order.id` **เลขเดียวกัน** ⇒ ถ้ากันซ้ำด้วยเลขใบลอย ๆ
  //    ลูกค้าที่ใช้แต้มแลกส่วนลดในใบนั้นจะไม่ได้แต้มจากใบนั้น = รูใหม่ที่แย่กว่าเดิม
  const s = makeStore();
  s.data.set('u/0811111111', { phone: '0811111111', points: 300 });
  assert.equal(await addPoints(s, '0811111111', -100, 'ใช้แลกส่วนลด', 'GC-1001'), 200);
  assert.equal(await addPoints(s, '0811111111', 25, 'ได้จากออเดอร์ GC-1001', 'GC-1001'), 225);
  assert.equal(s.data.get('u/0811111111').pointLog.length, 2);
});

test('ยอดรอรุ่นเก่าที่ไม่มี at: ยังโอนได้ แต่กันซ้ำไม่ได้ — ต้องไม่เงียบว่ากันได้', async () => {
  const s = makeStore();
  s.data.set('u/0822222222', { phone: '0822222222', points: 10 });
  s.data.set('pts/0822222222', { n: 70, note: 'ก้อนเก่าก่อน 14 ก.ย.' });
  s.state.ลบล้ม = true;
  assert.equal(await claimPending(s, '0822222222'), 70);
  s.state.ลบล้ม = false;
  // ไม่มี at ⇒ ไม่มีคีย์ ⇒ บวกซ้ำได้จริง · เขียนไว้ตรง ๆ ว่านี่คือขอบเขตที่ปิดไม่ได้
  assert.equal(await claimPending(s, '0822222222'), 70);
  assert.equal(s.data.get('u/0822222222').points, 150);
});
