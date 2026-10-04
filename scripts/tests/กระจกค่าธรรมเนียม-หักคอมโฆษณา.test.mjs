// รัน: node --experimental-test-module-mocks --test scripts/tests/กระจกค่าธรรมเนียม-หักคอมโฆษณา.test.mjs
// ใบ t_mum2bzeg — สูตรยอดโอน Shopee ต่าง 91 ใบ · สาเหตุคือ `order_ams_commission_fee`
//
// 📏 ยืนยันครบ 91/91 ใบ (เปิด escrow ดิบรายใบ · อ่านค่าได้ 91/91 · 4 ต.ค. 2569):
//    |formula_diff − ams| ≤ 1 บาท ใน **87/91 ใบ** · อธิบายได้ **4,571 จาก 4,801 บาท = 95.2%**
// 🔴 และมันหักล้างสมมติฐาน "VAT 7%" ที่ผมฟิตไว้ก่อนหน้า — Shopee มีช่องภาษี 11 ช่อง
//    และ **เป็นศูนย์ทุกช่องทุกใบทั้ง 91 ใบ** ⇒ 7% ที่ปิดได้ 37/91 เป็นความพ้องกันโดยบังเอิญ
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shopeeNet } from '../../netlify/lib/mkp-finance-mirror.mjs';
import { readFileSync } from 'node:fs';

const ฐาน = {
  itemsTotal: 3200, commission: 599, serviceFee: 274, paymentFee: 0,
  shippingActual: 155, shippingSubsidyByShopee: 155, shippingPaidByBuyer: 0,
  sellerTransactionFee: 103,
};

test('① หัก ams ออกจากยอดสุทธิ — ใบจริง 260901VAF3P2PC', () => {
  /* ของจริง: escrow 1767 · ก่อนหัก ams สูตรให้ 2224 (ต่าง 457) · ams = 456 */
  const ก่อน = shopeeNet({ ...ฐาน });
  const หลัง = shopeeNet({ ...ฐาน, amsCommission: 456 });
  assert.equal(ก่อน, 2224, 'สูตรเดิมต้องยังให้ค่าเดิม (กันการแก้ทับของเก่า)');
  assert.equal(หลัง, 1768, 'หลังหัก ams ต้องห่างจาก escrow 1767 เพียง 1 บาท');
  assert.equal(หลัง - 1767, 1, 'เหลือ 1 บาท = ค่าคงเหลือที่สูตรนี้มีอยู่เดิม ไม่ใช่ของใหม่');
});

test('② 🔑 ไม่มี ams ⇒ ต้องคิดได้ปกติ ห้ามคืน null', () => {
  /* ใบที่ไม่ได้ลงโฆษณาจะไม่มีช่องนี้เลย ⇒ ใส่ใน `need` จะทำให้สูตรคืน null ทั้งที่ควรคิดได้ */
  assert.equal(shopeeNet({ ...ฐาน }), 2224);
  assert.equal(shopeeNet({ ...ฐาน, amsCommission: null }), 2224);
  assert.equal(shopeeNet({ ...ฐาน, amsCommission: 0 }), 2224, 'ams 0 ต้องไม่เปลี่ยนผล');
});

test('③ คู่ตรงข้ามของ ②: ช่องที่จำเป็นขาด ⇒ ยังต้องคืน null', () => {
  for (const k of ['itemsTotal', 'commission', 'serviceFee', 'paymentFee', 'shippingActual'])
    assert.equal(shopeeNet({ ...ฐาน, amsCommission: 456, [k]: null }), null,
      `ขาด ${k} ⇒ ต้อง null · ห้ามแทน 0 แล้วคิดต่อ (ได้ diff สวยที่ไม่ได้พิสูจน์อะไร)`);
});

test('④ 🔑 คอลัมน์ · ที่วางค่า ? · ค่าที่ส่งจาก JS ต้องเท่ากันทั้งสามฝั่ง', () => {
  /* 🔴 ด่านนี้มาจากของจริง: ผมเพิ่มคอลัมน์ `ams_commission` และใส่ค่าใน array ครบ
     **แต่ลืมเพิ่ม `?` ในชุด VALUES** ⇒ ค่าทั้ง 20 ตัวจะเลื่อนไปลงคอลัมน์ผิดทั้งแถว
     และ `node --check` ผ่านฉลุยเพราะเป็น SQL ไม่ใช่ JS ⇒ ไม่มีอะไรจับได้นอกจากการนับ */
  const s = readFileSync('netlify/lib/mkp-finance-mirror.mjs', 'utf8');
  const cols = /INSERT INTO shopee_fees \(([^)]*)\)/s.exec(s)[1]
    .replace(/\n/g, ' ').split(',').map((x) => x.trim()).filter(Boolean);
  const ph = /VALUES \(([^)]*)\)\)?/.exec(s)[1];
  const nq = (ph.match(/\?/g) || []).length;
  const vals = /\[r\.order_sn,(.*?)\]\n\s*\);/s.exec(s)[1];
  const nv = 1 + vals.replace(/\n/g, ' ').split(',').map((x) => x.trim()).filter(Boolean).length;
  assert.equal(nq + 1, cols.length, `? มี ${nq} + datetime = ${nq + 1} · คอลัมน์ ${cols.length}`);
  assert.equal(nv + 1, cols.length, `ค่าจาก JS ${nv} + datetime = ${nv + 1} · คอลัมน์ ${cols.length}`);
  assert.ok(cols.includes('ams_commission'), 'ต้องมีคอลัมน์ ams_commission');
});

test('⑤ 🔬 พลังแยกแยะ: ถ้าถอดการหัก ams ออก ด่าน ① ต้องแดง', () => {
  const ไม่หัก = (f) => f.itemsTotal - f.commission - f.serviceFee - (f.sellerTransactionFee ?? 0)
    - f.paymentFee - f.shippingActual + (f.shippingSubsidyByShopee ?? 0) + (f.shippingPaidByBuyer ?? 0);
  assert.notEqual(ไม่หัก({ ...ฐาน, amsCommission: 456 }), 1768,
    'สูตรที่ไม่หัก ams ต้องให้ค่าต่างจากที่ด่าน ① ต้องการ ⇒ ① แดงจริงเมื่อมีคนถอย');
});

test('⑥ 🔑 ทุกคอลัมน์เงินในตาราง ต้องถูก SELECT ออกมาทั้งเส้นรายใบและเส้นสรุป', () => {
  /* 🔴 คลาสนี้เป็นของประจำไฟล์นี้ **เจอครั้งที่สามแล้ว**:
       · 27 ก.ย. 2569 — สรุปไม่ได้ SELECT 4 ช่อง ⇒ มีส่วนต่าง 2,306 บาทที่ "ไม่มีชื่อ"
       · 4 ต.ค. 2569 — `unit_cost` ใน stock_moves เขียนลงได้แต่ไม่มีใครอ่าน ⇒ ขั้นงานทั้งขั้นไม่มีผล
       · 4 ต.ค. 2569 — `ams_commission` รอบนี้: เกือบเขียนลงแล้วไม่ SELECT ออก
     🔑 ช่องที่เขียนลงแต่อ่านไม่ได้ **ผ่านทุกการทดสอบฝั่งเขียนโดยนิยาม** ⇒ ด่านต้องอยู่ฝั่งอ่าน
     ⚠️ ด่านนี้คิดรายชื่อจาก DDL เสมอ **ห้ามเขียนรายชื่อตายตัว** ไม่งั้นคอลัมน์ที่เพิ่มวันหน้าหลุดฟรี */
  const s = readFileSync('netlify/lib/mkp-finance-mirror.mjs', 'utf8');
  const ddl = /CREATE TABLE IF NOT EXISTS shopee_fees \(([\s\S]*?)\n\s*at TEXT/.exec(s)[1];
  const เงิน = [...ddl.matchAll(/^\s*([a-z_]+) REAL/gm)].map((m) => m[1])
    .concat([...ddl.matchAll(/,\s*([a-z_]+) REAL/g)].map((m) => m[1]));
  /* คอลัมน์ที่เพิ่มทีหลังมาทาง ALTER ไม่ได้อยู่ใน DDL ก้อนเดียวกันเสมอ ⇒ เก็บจาก ALTER ด้วย */
  const altered = [...s.matchAll(/ALTER TABLE shopee_fees ADD COLUMN ([a-z_]+) REAL/g)].map((m) => m[1]);
  const ทั้งหมด = [...new Set([...เงิน, ...altered])].filter((c) => c !== 'formula_diff');
  assert.ok(ทั้งหมด.length >= 15, `ต้องเจอคอลัมน์เงินอย่างน้อย 15 ช่อง เจอ ${ทั้งหมด.length} ⇒ regex อ่าน DDL ไม่ติด`);
  assert.ok(ทั้งหมด.includes('ams_commission'), 'ด่านต้องมองเห็นคอลัมน์ที่เพิ่มทาง ALTER ด้วย');

  const rowsSql = /SELECT order_sn, day, escrow,([\s\S]*?)FROM shopee_fees WHERE/.exec(s)[1];
  const sumSql = /SELECT COUNT\(\*\) AS ใบในกระจก,([\s\S]*?)FROM shopee_fees WHERE/.exec(s)[1];
  const ขาดrows = ทั้งหมด.filter((c) => !new RegExp(`\\b${c}\\b`).test(rowsSql) && c !== 'escrow');
  const ขาดsum  = ทั้งหมด.filter((c) => !new RegExp(`\\b${c}\\b`).test(sumSql) && c !== 'escrow');
  assert.deepEqual(ขาดrows, [], `เส้นรายใบไม่ได้คืนคอลัมน์: ${ขาดrows.join(', ')}`);
  assert.deepEqual(ขาดsum, [], `เส้นสรุปไม่ได้รวมคอลัมน์: ${ขาดsum.join(', ')}`);
});

test('⑦ 🔬 พลังแยกแยะของ ⑥: ชื่อคอลัมน์ที่ไม่มีใคร SELECT ต้องถูกจับได้', () => {
  const s = readFileSync('netlify/lib/mkp-finance-mirror.mjs', 'utf8');
  const rowsSql = /SELECT order_sn, day, escrow,([\s\S]*?)FROM shopee_fees WHERE/.exec(s)[1];
  assert.ok(!/\bcolumn_ที่ไม่มีจริง\b/.test(rowsSql),
    'ชื่อสมมติต้องไม่ถูกเจอใน SELECT ⇒ วิธีตรวจของ ⑥ แยกแยะได้จริง ไม่ได้ผ่านเพราะ regex จับทุกอย่าง');
});

test('⑧ 🔴 โหมดกวาดซ้ำต้องเดินหน้าได้ — ห้ามหยิบใบใหม่สุดชุดเดิมทุกรอบ', () => {
  /* ของจริง 4 ต.ค. 2569: ท่านประธานสั่ง "กวาดกระจกซ้ำ" เพื่อให้ 91 แถวเก่าคิด formula_diff ใหม่
     แล้วผมพบว่า refresh **ทำไม่ได้** — มันถอด LEFT JOIN แล้วเรียง order_date DESC LIMIT 40
     ⇒ ทุกรอบได้ 40 ใบใหม่สุดชุดเดิม · ตอบ "เขียนแล้ว 40" ทุกรอบ ⇒ **หน้าตาเหมือนคืบหน้า**
     🔑 ด่านนี้อ่านตัวสร้าง SQL ตรง ๆ เพราะผลลัพธ์ปลายทางถูกทุกรอบ (เขียน 40 ใบจริง)
        สิ่งที่ผิดคือ **ชุดที่ถูกเลือก** ซึ่งมองจากผลลัพธ์รอบเดียวไม่เห็น */
  const s = readFileSync('netlify/lib/mkp-finance-mirror.mjs', 'utf8');
  const sql = /const sql = `SELECT o\.order_sn([\s\S]*?)`;/.exec(s)[1];
  assert.ok(/LEFT JOIN shopee_fees f/.test(sql),
    'ต้อง JOIN ตารางค่าธรรมเนียมทุกโหมด ไม่งั้นโหมดกวาดซ้ำไม่รู้ว่าใบไหนกวาดไปแล้ว');
  assert.ok(/f\.at ASC/.test(sql), 'โหมดกวาดซ้ำต้องเรียงจากใบที่ซิงก์ไว้นานสุด (at เก่าสุดก่อน)');
  assert.ok(/refresh \? "CASE WHEN f\.at IS NULL/.test(sql),
    'ใบที่ยังไม่มีแถวต้องมาก่อนใบที่มีแถวแล้ว ในโหมดกวาดซ้ำ');
  assert.ok(/\$\{refresh \? "" : "AND f\.order_sn IS NULL"\}/.test(sql),
    'โหมดปกติต้องยังกรองเฉพาะใบที่ไม่มีแถว (ห้ามแก้ทับพฤติกรรมเดิม)');
});

test('⑨ 🔑 เลข "ค้างก่อนรอบนี้" ของสองโหมดนับคนละอย่าง ⇒ ต้องมีป้ายบอก', () => {
  /* กฎ numbers-need-scope: แหล่งของเลขไม่ใช่ขอบเขตของเลข
     โหมดกวาดซ้ำถ้าใช้เกณฑ์ "ยังไม่มีแถว" จะได้ 0 ตลอด ⇒ ดูเหมือนเสร็จตั้งแต่รอบแรก */
  const s = readFileSync('netlify/lib/mkp-finance-mirror.mjs', 'utf8');
  assert.ok(/ams_commission IS NULL/.test(s), 'โหมดกวาดซ้ำต้องนับใบที่ยังไม่มีค่าคอมโฆษณา');
  assert.ok(/"ค้างก่อนรอบนี้นับอะไร"/.test(s), 'ต้องส่งป้ายบอกความหมายของเลขไปกับคำตอบ');
  assert.ok(/โหมด: refresh \?/.test(s), 'คำตอบต้องบอกว่ารอบนี้ทำงานโหมดไหน');
});
