/* ด่าน B09 (ใบ t_mv4m53rm) — `fetchPage` ต้องเคารพสัญญาของ `collectZortStock`
 *   `null`/throw = **พลาด** (ลองซ้ำ + นับใน partial) · `[]` = **จบหน้าแล้ว**
 * 🔴 ของเดิม `r.json().catch(() => ({}))` แล้ว `d.list || []` ⇒ JSON เสีย = บอกว่า "ข้อมูลหมด"
 *    ⇒ กวาดหยุดที่ batch แรก · partial:false · stale:false ⇒ แคชถูกเขียนทับด้วยสต็อกไม่ครบ
 *    ⇒ SKU ที่ตกหล่นกลายเป็น "ไม่มีของ" บนหน้าร้านและใน /products.json โดยหน้าสถานะเขียวหมด
 * 🔑 ทดสอบผ่าน `collectZortStock` ที่ export อยู่ — ตัวนี้คือเส้นที่ของจริงเดิน
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { collectZortStock } from '../../netlify/lib/zort-stock.mjs';

const แถว = (sku, n) => ({ sku, name: `ของ ${sku}`, availablestock: n, sellprice: 10 });

test('🔴 หน้าที่พลาด (throw) ต้องถูกนับว่าไม่ครบ — ไม่ใช่ถือว่าข้อมูลหมด', async () => {
  const หน้า = {
    1: [แถว('A', 5), แถว('B', 7)],
    2: 'พลาด',                       // เลียนแบบ JSON เสีย ⇒ ของจริงจะ throw
    3: [แถว('C', 9)],
  };
  const ผล = await collectZortStock(async (p) => {
    if (หน้า[p] === 'พลาด') throw new Error('อ่าน JSON ไม่ได้');
    return หน้า[p] ?? [];
  });
  assert.equal(ผล.partial, true, '🔑 ขาดหน้า ⇒ partial ต้องเป็น true (ไม่งั้นแคชจะถูกเขียนทับ)');
  assert.ok(ผล.หน้าที่พลาด >= 1, `ต้องบอกจำนวนหน้าที่พลาด (ได้ ${ผล.หน้าที่พลาด})`);
  assert.ok(ผล.map.A && ผล.map.C, 'หน้าที่อ่านได้ต้องยังอยู่ — ทิศคือ "เอาเท่าที่รู้"');
});

test('ตัวควบคุมลบ: ทุกหน้าอ่านได้ ⇒ partial false · หน้าว่างจริงคือการจบ ไม่ใช่ความผิดพลาด', async () => {
  const ผล = await collectZortStock(async (p) => (p === 1 ? [แถว('A', 1), แถว('B', 2)] : []));
  assert.equal(ผล.partial, false, 'ครบ ⇒ partial false (ไม่งั้นแคชจะไม่ถูกเขียนเลยตลอดกาล)');
  assert.equal(ผล.หน้าที่พลาด, 0);
  assert.equal(Object.keys(ผล.map).length, 2);
});

test('🔑 สต็อกอ่านไม่ได้ ⇒ **ตัวนับต้องร้อง** (ค่ายังเป็น 0 โดยตั้งใจ — รอใบงานแยก)', async () => {
  const ผล = await collectZortStock(async (p) => (p === 1
    ? [{ sku: 'A', name: 'ก', sellprice: 10 },                       // ไม่มีช่องสต็อกเลย
       { sku: 'B', name: 'ข', availablestock: 4, sellprice: 10 }]
    : []));
  /* รูปของ map คือ `[สต็อก, ราคา]` และบรรทัด 117 ยัง `?? 0` อยู่ **โดยตั้งใจ**
     คอมเมนต์ในไฟล์เขียนไว้เองว่า ปลายทาง 4 ตัว (products-feed · orders · feed-health ·
     catalog-feed) คาดว่าได้ตัวเลข ⇒ เปลี่ยนเป็น null ต้องแก้พร้อมกัน ⇒ **คนละใบงาน**
     ⇒ เทสนี้จึงล็อก **ตัวนับ** ไม่ล็อกค่า — ตัวนับคือสิ่งเดียวที่ทำให้ "ไม่รู้" ยังมีตัวตน
     ⚠️ วันที่ใบงานนั้นถูกทำ ให้มาแก้เทสนี้พร้อมกัน (ค่าจะกลายเป็น null) */
  assert.deepEqual(ผล.map.B, [4, 10], 'แถวที่อ่านได้ต้องตรง');
  assert.equal(ผล.map.A[0], 0, 'ยังเป็น 0 ตามที่ตั้งใจไว้ — ถ้าวันหนึ่งเป็น null คือใบงานนั้นถูกทำแล้ว');
  assert.ok(ผล.unreadableStock >= 1,
    `🔑 ตัวนับต้องร้อง ไม่งั้น "อ่านไม่ได้" จะไม่มีตัวตนเลย (ได้ ${ผล.unreadableStock})`);
  assert.equal(ผล.unreadablePrice, 0, 'ราคาอ่านได้ทั้งสองแถว ⇒ ตัวนับต้องเป็น 0 (ตัวควบคุมลบ)');
});
