// รัน: node --test "scripts/tests/อะไหล่-สี่สถานะกับยอดรวม.test.mjs"
//
// จอ /parts/ โชว์ราคา/สต็อก/ปุ่มซื้อ ⇒ ตัวตัดสินสถานะถูกยกออกมาเป็นฟังก์ชันล้วน
// เพราะ "กดแล้วจอเปลี่ยนไหม" ตัดสินของแบบนี้ไม่ได้ (บทเรียน แดงลวงจากตัวทดสอบที่ดูจอ)
//
// ⚠️ เคสควบคุมสองทิศครบทุกข้อ:
//    · ควรจับ    = ไม่รู้สต็อก ⇒ ต้องได้ "ยังอ่านไม่ได้" ไม่ใช่ "หมด"
//    · ต้องไม่จับ = รู้สต็อกและเป็น 0 ⇒ ต้องได้ "หมด" จริง ๆ (ไม่ใช่เหมาว่าไม่รู้ทั้งกระดาน)
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// lib/parts.ts เป็น TypeScript — แปลงด้วย tsc ตัวในเครื่องแล้ว import ของจริง
// (ห้ามคัดลอกตรรกะมาเขียนซ้ำในเทส ไม่งั้นเทสยืนยันสำเนา ไม่ได้ยืนยันของที่รันจริง)
const ที่ = mkdtempSync(join(tmpdir(), 'parts-lib-'));
execFileSync('npx', ['tsc', 'src/lib/parts.ts', '--outDir', ที่, '--module', 'es2022',
  '--target', 'es2022', '--moduleResolution', 'bundler'], { stdio: 'pipe' });
writeFileSync(join(ที่, 'package.json'), '{"type":"module"}');
const { สภาพของอะไหล่, ซื้อได้, สรุปที่เลือก, อ่านของในร้าน, คีย์อะไหล่ } =
  await import(join(ที่, 'parts.js'));

const ของ = (o = {}) => ({ sku: '04382', handle: 'h', id: 'p1', title: 'สกรู', price: 120, image: '/img/a.webp', st: 5, ...o });

test('สี่สถานะ — "ไม่รู้" ต้องไม่กลายเป็น "หมด" และ "หมด" ต้องไม่กลายเป็น "ไม่รู้"', () => {
  assert.equal(สภาพของอะไหล่(undefined, undefined), 'ยังไม่ได้จับคู่');
  assert.equal(สภาพของอะไหล่('', ของ()), 'ยังไม่ได้จับคู่', 'sku ว่าง = ยังไม่จับคู่ แม้มีของส่งมา');
  // ควรจับ: จับคู่แล้วแต่ไม่รู้สต็อก
  assert.equal(สภาพของอะไหล่('04382', undefined), 'ยังอ่านไม่ได้');
  assert.equal(สภาพของอะไหล่('04382', ของ({ st: null })), 'ยังอ่านไม่ได้');
  // ต้องไม่จับ: รู้ว่าเป็น 0 จริง
  assert.equal(สภาพของอะไหล่('04382', ของ({ st: 0 })), 'หมด');
  assert.equal(สภาพของอะไหล่('04382', ของ({ st: 7 })), 'มีสินค้า');
});

test('ซื้อได้ ต้องการข้อมูลพอสร้างแถวในตะกร้า ไม่ใช่แค่มีของ', () => {
  assert.equal(ซื้อได้('มีสินค้า', ของ()), true);
  assert.equal(ซื้อได้('มีสินค้า', ของ({ handle: null })), false, 'ไม่มี handle = หน้าตะกร้าจะมีแถวที่กดต่อไม่ได้');
  assert.equal(ซื้อได้('มีสินค้า', ของ({ price: null })), false, 'ไม่มีราคา = คิดเงินไม่ได้');
  assert.equal(ซื้อได้('มีสินค้า', ของ({ price: 0 })), false);
  assert.equal(ซื้อได้('หมด', ของ({ st: 0 })), false);
  assert.equal(ซื้อได้('ยังอ่านไม่ได้', ของ({ st: null })), false, 'ไม่รู้สต็อก ⇒ ห้ามให้กดซื้อ');
});

test('สรุปที่เลือก คืนสองเลข และข้ามชิ้นที่ไม่มีราคา (ห้ามนับเป็น 0 บาท)', () => {
  const ทั้งหมด = { A: ของ({ price: 120 }), B: ของ({ price: 50 }), C: ของ({ price: null }) };
  const s = สรุปที่เลือก({ A: 2, B: 3, C: 9 }, ทั้งหมด);
  assert.equal(s.รายการ, 2, 'C ไม่มีราคา ⇒ ไม่นับเป็นรายการ');
  assert.equal(s.ชิ้น, 5);
  assert.equal(s.เงิน, 2 * 120 + 3 * 50);
  assert.deepEqual(สรุปที่เลือก({ A: 0 }, ทั้งหมด), { รายการ: 0, ชิ้น: 0, เงิน: 0 });
  assert.deepEqual(สรุปที่เลือก({ ไม่มีตัวนี้: 4 }, ทั้งหมด), { รายการ: 0, ชิ้น: 0, เงิน: 0 });
});

test('อ่านของในร้าน — ช่องที่หายต้องเป็น null ไม่ใช่ undefined และไม่ใช่ 0', () => {
  const r = อ่านของในร้าน({
    items: {
      '1123 020 1209': { sku: '04382', handle: 'h', id: 'p1', title: 'ชื่อ', price: 1250, image: '/i.webp', st: 3 },
      '1125 640 7200': { sku: '04999' },                       // มีแต่ sku
      '9999 999 9999': { handle: 'h2', price: 10 },            // ไม่มี sku ⇒ ทิ้ง
    },
  });
  assert.equal(Object.keys(r).length, 2);
  const a = r[คีย์อะไหล่('1123 020 1209')];
  assert.equal(a.price, 1250);
  assert.equal(a.st, 3);
  const b = r['11256407200'];
  assert.equal(b.price, null, 'ไม่ส่งราคา ⇒ null ห้ามเป็น 0');
  assert.equal(b.st, null, 'ไม่ส่งสต็อก ⇒ null ห้ามเป็น 0');
  assert.equal(b.handle, null);
  // ต้องไม่จับ: คำตอบที่ไม่มี items เลย ⇒ ก้อนว่าง ไม่ใช่โยน
  assert.deepEqual(อ่านของในร้าน(null), {});
  assert.deepEqual(อ่านของในร้าน({ items: 'ไม่ใช่ก้อน' }), {});
  // ค่าเพี้ยนต้องไม่กลายเป็นเลข
  const c = อ่านของในร้าน({ items: { X: { sku: 's', price: 'ฟรี', st: 'หมด' } } }).X;
  assert.equal(c.price, null);
  assert.equal(c.st, null);
});
