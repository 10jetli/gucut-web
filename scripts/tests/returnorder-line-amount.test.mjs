// รัน: node --experimental-test-module-mocks --test scripts/tests/returnorder-line-amount.test.mjs
//
// 🔴 **สิ่งที่เทสนี้เฝ้า: ยอดต่อบรรทัดของใบคืน ต้องมีช่องแบนและต้องไม่ถูกคิดแทน**
//    ของเดิม `?returnorder=` ให้บรรทัดแค่ sku/name/qty/unit · ยอดซ่อนใต้ `ทุกช่องในบรรทัด`
//    และเส้นพี่น้อง `?order=` ใช้คีย์ `items` ไม่ใช่ `lines`
//    ⇒ ฝั่งจอเขียนตัวยิงอ่าน `items[].amount` **ได้ 0 บรรทัด จึงสรุปว่า "ไม่มีใบคืน"**
//       ซึ่งเป็น **ลบลวง** (เจอจริง 21 ต.ค. 2569 23:4x) ⇒ เกือบทำให้ปิดเคสผิด
//    🔑 สัญญาที่ให้ปลายทางเดาชื่อคีย์ จะถูกเดาผิด **แล้วรายงานว่า "ไม่มีของ"**
//
// ⚠️ ข้อที่สองสำคัญกว่าข้อแรก: **ไม่มี `totalprice` ⇒ ต้องเป็น `null` ห้ามคิดแทน**
//    ยอดคืนที่คิดแทนแล้วผิด = ยอดขายทั้งร้านผิด (เส้นขายมีตัวซ่อมแบบนั้นโดยตั้งใจ เส้นคืนไม่มี)
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.ZORT_STORENAME = 's';
process.env.ZORT_APIKEY = 'k';
process.env.ZORT_APISECRET = 'x';

let ก้อนจากZORT = null;
globalThis.fetch = async () => ({
  ok: true, status: 200,
  json: async () => ก้อนจากZORT,
  text: async () => JSON.stringify(ก้อนจากZORT),
});

const { getReturnOrderDetail } = await import('../../netlify/lib/core-purchases.mjs');

function ตั้งใบ(บรรทัด) {
  ก้อนจากZORT = {
    resCode: '200', resDesc: 'success',
    id: 311781073, number: 'CN-TEST-1', status: 'Success',
    list: บรรทัด,
  };
}

test('① มีช่อง amount แบน และค่ามาจาก totalprice ของ ZORT', async () => {
  ตั้งใบ([{ sku: '00370', name: 'โซ่ทดสอบ', number: 22.5, unittext: 'PCS',
            pricepernumber: 16, totalprice: 370 }]);
  const d = await getReturnOrderDetail('311781073');
  assert.ok(Array.isArray(d.lines), 'ต้องมีอาเรย์ lines');
  assert.equal(d.lines.length, 1);
  // 🔑 ช่องแบน — ปลายทางไม่ต้องเดาคีย์ซ้อน
  assert.equal(d.lines[0].amount, 370, 'amount ต้องเท่า totalprice');
  assert.equal(d.lines[0].sku, '00370');
  assert.equal(d.lines[0].qty, 22.5);
  // ของเดิมต้องยังอยู่ (เพิ่มอย่างเดียว ไม่ทับ)
  assert.equal(d.lines[0]['ทุกช่องในบรรทัด'].totalprice, 370);
});

test('② ไม่มี totalprice ⇒ amount = null **ห้ามคิดแทนด้วย ราคา × จำนวน**', async () => {
  // ของปลูกที่อันตรายที่สุด: มีราคาต่อหน่วยกับจำนวนครบ ⇒ คิดแทนได้ง่าย แต่ห้ามคิด
  ตั้งใบ([{ sku: '00894', name: 'โซ่ทดสอบสอง', number: 38, unittext: 'PCS',
            pricepernumber: 17.1 }]);
  const d = await getReturnOrderDetail('311781073');
  assert.equal(d.lines[0].amount, null,
    'ZORT ไม่ส่ง totalprice ⇒ ต้องเป็น null (ไม่ใช่ 649.8 ที่คิดแทน)');
  assert.notEqual(d.lines[0].amount, 38 * 17.1);
});

test('③ totalprice = 0 ต้องเป็น 0 ไม่ใช่ null (ของแถม/คืนราคาศูนย์มีจริง)', async () => {
  // 🔑 สามสถานะ: 0 = ZORT บอกว่าศูนย์ · null = ZORT ไม่ส่งช่องนี้ · เลข = ยอดจริง
  ตั้งใบ([{ sku: '03385', name: 'โซ่ทดสอบสาม', number: 1, unittext: 'PCS', totalprice: 0 }]);
  const d = await getReturnOrderDetail('311781073');
  assert.equal(d.lines[0].amount, 0, '0 ของ ZORT ต้องมาถึงปลายทางเป็น 0');
  assert.notEqual(d.lines[0].amount, null);
});

test('④ ตัวควบคุมลบ: ใบที่ไม่มีบรรทัดเลย ⇒ lines เป็น [] ไม่ใช่ล้ม', async () => {
  ตั้งใบ([]);
  const d = await getReturnOrderDetail('311781073');
  assert.ok(Array.isArray(d.lines), 'ใบไม่มีของ ⇒ ต้องเป็นอาเรย์ว่าง');
  assert.equal(d.lines.length, 0);
});

// ══ ⑤–⑦ หัวใบ: ห้าช่องที่ฝั่งจอขอ + ชื่อคีย์วันที่ที่เคยผิด ══════════════════════
// 🔴 ทั้งห้าช่องอยู่ใน `fields` (= ZORT ส่งมา) อยู่แล้ว แต่ท่อไม่ส่งต่อสักตัว
//    ⇒ จอใบรับคืนขึ้น "ยังไม่รู้" ที่สถานะชำระเงิน **ทั้งที่ ZORT บอกว่าชำระครบ**
//    🔑 คลาสเดียวกับช่อง amount ของบรรทัด: ค่ามีอยู่แต่ไม่ถูกตั้งชื่อส่งต่อ
//       ⇒ ปลายทางแยก "ไม่มีค่า" จาก "ท่อไม่ส่ง" ไม่ได้

test('⑤ ส่งต่อห้าช่องหัวใบที่จอขอ และเป็น null เมื่อ ZORT ไม่ส่ง (ไม่ใช่สตริงว่าง)', async () => {
  ก้อนจากZORT = {
    resCode: '200', id: 1, number: 'CN-TEST-2', status: 'Success',
    paymentstatus: 'Paid', saleschannel: 'Shopee', createusername: 'cashier01',
    customerphone: '0810000000', customeraddress: '— ทดสอบ',
    list: [{ sku: 'A', number: 1, totalprice: 10 }],
  };
  const d = await getReturnOrderDetail('1');
  assert.equal(d.paymentstatus, 'Paid');
  assert.equal(d.saleschannel, 'Shopee');
  assert.equal(d.createusername, 'cashier01');
  assert.equal(d.customerphone, '0810000000');
  assert.equal(d.customeraddress, '— ทดสอบ');

  // ZORT ไม่ส่งช่องเลย ⇒ null · **ห้ามเป็นสตริงว่าง** (สตริงว่าง = ZORT ส่งมาว่าง คนละเรื่อง)
  ก้อนจากZORT = { resCode: '200', id: 1, number: 'CN-TEST-3', status: 'Success', list: [] };
  const e = await getReturnOrderDetail('1');
  for (const k of ['paymentstatus', 'saleschannel', 'createusername',
                   'customerphone', 'customeraddress']) {
    assert.equal(e[k], null, `${k} ต้องเป็น null ไม่ใช่ ${JSON.stringify(e[k])}`);
  }
});

test('⑥ ZORT ส่งมาเป็นสตริงว่าง ⇒ ต้องได้สตริงว่าง ไม่ใช่ null', async () => {
  // 🔑 สามสถานะ: "" = ZORT ส่งมาว่าง · null = ZORT ไม่ส่งช่อง · มีค่า = ค่าจริง
  ก้อนจากZORT = { resCode: '200', id: 1, number: 'CN-4', status: 'Success',
                  paymentstatus: '', list: [] };
  const d = await getReturnOrderDetail('1');
  assert.equal(d.paymentstatus, '', 'ZORT ส่งว่าง ⇒ ต้องเป็น "" ไม่ใช่ null');
  assert.notEqual(d.paymentstatus, null);
});

test('⑦ วันที่ต้องมาจาก returnorderdate* ไม่ใช่วันสร้างเอกสาร', async () => {
  // 🔴 ของเดิมอ่าน r.returndateString / r.returndate ซึ่ง **ไม่มีใน 68 คีย์ของ ZORT**
  //    ⇒ ตกไปใช้ createdatetimeString = วันสร้างเอกสาร โดยไม่มีอะไรฟ้อง
  ก้อนจากZORT = {
    resCode: '200', id: 1, number: 'CN-5', status: 'Success',
    returnorderdateString: '2026-10-19', createdatetimeString: '2026-10-03 09:00',
    list: [],
  };
  const d = await getReturnOrderDetail('1');
  assert.equal(d.date, '2026-10-19', 'date ต้องเป็นวันคืนของ');
  assert.notEqual(d.date, '2026-10-03', 'ต้องไม่ใช่วันสร้างเอกสาร');
  assert.equal(d.createdAt, '2026-10-03 09:00', 'ส่งวันสร้างแยกไว้ให้เทียบเองได้');
});

test('⑧ ไม่มี returnorderdate* ⇒ date = null **ห้ามถอยไปใช้วันสร้างเอกสาร**', async () => {
  // 🔴 เคสนี้คือตัวที่จับบั๊กเดิมได้จริง และข้อ ⑦ จับไม่ได้
  //    ข้อ ⑦ ใส่ returnorderdateString ไว้ ⇒ กิ่งแรกชนะ ตัวถอยกลับไม่เคยทำงาน
  //    ⇒ **ปลูกบั๊ก "เติม ?? createdatetimeString กลับเข้าไป" แล้วข้อ ⑦ ยังเขียว**
  //    🔑 บทเรียน: เทสที่พิสูจน์ว่า "ค่าถูก" ไม่ได้พิสูจน์ว่า "ไม่มีทางถอยไปค่าผิด"
  //       ต้องมีเคสที่ **ทางที่ถูกหายไป** ถึงจะเห็นว่าโค้ดถอยไปไหน
  //    ⚠️ ถอยไปใช้วันสร้างเอกสารแล้วจอจะโชว์วันผิดแบบดูปกติ (สองค่านี้มักตรงกัน)
  //       ⇒ null คือคำตอบที่ถูก เพราะ "ไม่รู้วันคืนของ" ≠ "วันคืนของคือวันที่สร้าง"
  ก้อนจากZORT = {
    resCode: '200', id: 1, number: 'CN-6', status: 'Success',
    createdatetimeString: '2026-10-03 09:00',
    list: [],
  };
  const d = await getReturnOrderDetail('1');
  assert.equal(d.date, null, 'ไม่มีวันคืนของ ⇒ null');
  assert.notEqual(d.date, '2026-10-03', 'ห้ามถอยไปใช้วันสร้างเอกสาร');
  assert.equal(d.createdAt, '2026-10-03 09:00', 'วันสร้างยังส่งแยกไว้ตามเดิม');
});
