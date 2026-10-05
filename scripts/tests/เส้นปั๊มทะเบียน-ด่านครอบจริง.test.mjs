// รัน: node --experimental-test-module-mocks --test scripts/tests/เส้นปั๊มทะเบียน-ด่านครอบจริง.test.mjs
//
// ฝั่งจอเขียนตัวปั๊ม `sold_at` แล้วขอให้ผมต่อเส้น HTTP ให้ (5 ต.ค. 2569) · เขาฝากสามข้อ
// และข้อที่สามคือ "ขอให้วางในตำแหน่งที่ด่านครอบจริง — ผมอ่าน core.mjs ไม่ได้ จึงไม่เดาว่าด่านอยู่บรรทัดไหน"
//
// 🔴 **เส้นนี้เขียนบัญชีรับ-จำหน่ายตามกฎหมาย** (ปั๊มว่าเลขซีเรียลใบนั้นขายแล้ว)
//    ⇒ ความผิดที่นี่ไม่ใช่ตัวเลขบนจอ แต่เป็นของหายจากบัญชี ⇒ ด่านต้องตรวจตำแหน่ง ไม่ใช่เชื่อสายตา
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const บรรทัด = readFileSync('netlify/functions/core.mjs', 'utf8').split('\n');
const หา = (คำ, เงื่อนไข = () => true) => {
  const i = บรรทัด.findIndex((l) => l.includes(คำ) && เงื่อนไข(l));
  return i < 0 ? null : i + 1;
};

test('① 🔒 เส้น registrystamp ต้องอยู่ "หลัง" บรรทัดที่เรียก adminGate', () => {
  const ด่าน = หา('const gate = await adminGate');
  const เส้น = หา('registrystamp', (l) => l.includes('searchParams'));
  assert.ok(ด่าน, 'หาบรรทัด adminGate ไม่เจอ ⇒ ด่านนี้วัดของผิดตัว ห้ามเขียวเฉย ๆ');
  assert.ok(เส้น, 'หาเส้น registrystamp ไม่เจอ');
  assert.ok(เส้น > ด่าน,
    `🔴 registrystamp อยู่บรรทัด ${เส้น} แต่ด่านอยู่ ${ด่าน} ⇒ เปิดเส้นเขียนทะเบียนให้คนไม่มีรหัส`);
});

test('② 🔬 พลังแยกแยะของ ①: ถ้าเส้นอยู่ก่อนด่าน ต้องจับได้', () => {
  /* จำลองไฟล์ที่วางผิดลำดับ แล้วยืนยันว่าตรรกะเดียวกันตอบ "ผิด"
     ⇒ ข้อ ① ไม่ได้ผ่านเพราะเงื่อนไขเป็นจริงเสมอ */
  const ปลอม = ['if (url.searchParams.get("registrystamp")) {', 'const gate = await adminGate(req, context);'];
  const ด่าน = ปลอม.findIndex((l) => l.includes('const gate = await adminGate')) + 1;
  const เส้น = ปลอม.findIndex((l) => l.includes('registrystamp')) + 1;
  assert.ok(!(เส้น > ด่าน), 'ในไฟล์ปลอมนี้เส้นอยู่ก่อนด่าน ⇒ เกณฑ์ของข้อ ① ต้องตอบว่าผิด');
});

test('③ 🔒 ผิด method ต้องได้ 405 ไม่ใช่ทำงาน', () => {
  const src = readFileSync('netlify/functions/core.mjs', 'utf8');
  const ก้อน = /if \(url\.searchParams\.get\("registrystamp"\)\) \{[\s\S]*?\n    \}/.exec(src)?.[0] ?? '';
  assert.ok(ก้อน.length > 150, `หาก้อนไม่เจอหรือสั้นผิดปกติ (${ก้อน.length})`);
  const โค้ด = ก้อน.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  assert.ok(/req\.method !== "POST"/.test(โค้ด), 'ต้องเช็คว่าเป็น POST');
  assert.ok(/405/.test(โค้ด), 'และต้องตอบ 405 เมื่อผิด method');
});

test('④ 🔑 ห้ามเทียบคำว่า "ปั๊มจริง" ซ้ำในเส้นนี้ — เกณฑ์ต้องมีแหล่งเดียว', () => {
  /* ตัวตัดสินซ้อม/จริงอยู่ใน licensed-stamp.mjs (`ยืนยัน !== "ปั๊มจริง"`)
     ถ้าเส้น HTTP เทียบเองอีกชั้น วันที่ใครแก้คำนั้น จะได้สองที่ที่ไม่ตรงกัน
     ⇒ และที่แย่กว่า: เส้นอาจปล่อยผ่านทั้งที่ตัวทำถือว่าเป็นรอบซ้อม (หรือกลับกัน) */
  const src = readFileSync('netlify/functions/core.mjs', 'utf8');
  const ก้อน = /if \(url\.searchParams\.get\("registrystamp"\)\) \{[\s\S]*?\n    \}/.exec(src)[0];
  const โค้ด = ก้อน.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  assert.ok(!/"ปั๊มจริง"/.test(โค้ด), 'โค้ดของเส้นนี้ห้ามมีคำว่า "ปั๊มจริง" (ส่งต่อให้ตัวทำตัดสิน)');
  assert.ok(/ยืนยัน: body\?\.ยืนยัน/.test(โค้ด), 'ต้องส่งค่าที่ได้มาต่อไปตรง ๆ');
  const lib = readFileSync('netlify/lib/licensed-stamp.mjs', 'utf8');
  assert.ok(/ยืนยัน !== "ปั๊มจริง"/.test(lib),
    'ยืนยันว่าตัวตัดสินอยู่ใน lib จริง (ถ้าข้อนี้ตก เหตุผลของข้อ ④ หายไป)');
});

test('⑤ 🔒 body อ่านไม่ได้ ต้องตกไปเป็นรอบซ้อม ไม่ใช่โยน 500 และไม่ใช่ปั๊มจริง', () => {
  const src = readFileSync('netlify/functions/core.mjs', 'utf8');
  const ก้อน = /if \(url\.searchParams\.get\("registrystamp"\)\) \{[\s\S]*?\n    \}/.exec(src)[0];
  const โค้ด = ก้อน.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  assert.ok(/\.catch\(\(\) => \(\{\}\)\)/.test(โค้ด),
    'อ่าน body พลาดต้องได้ก้อนว่าง ⇒ ไม่มี `ยืนยัน` ⇒ ตัวทำถือเป็นรอบซ้อม (ล้มด้านปลอดภัย)');
});
