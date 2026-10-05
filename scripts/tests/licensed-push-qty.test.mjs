/* ด่าน: ตัวดันสต็อกต้องใช้เลขจากทะเบียน **ไม่ใช่เลขจาก ZORT**
 *
 * 🔴 ที่มา 5 ต.ค. 2569 · ท่านประธานสั่ง "ให้ตัวดันสต็อกอ่าน licensed-stock เหมือนหน้าร้าน"
 *    อาการก่อนแก้: หน้าร้านอ่านทะเบียน แต่ตัวดันสต็อกอ่าน ZORT (0 กับ −1)
 *    ⇒ `Bar NW 24-7800` ถูกข้ามติดกัน Shopee 1,765 · TikTok 1,710 · Lazada 530 = 4,005 ครั้งใน 18 วัน
 *
 * 🔑 สองเรื่องที่ด่านนี้ต้องแยกให้ขาด เพราะเสียหายคนละทิศ:
 *    ① ทับได้ ⇒ เลขที่ไปแพลตฟอร์มต้องเป็นเลขทะเบียน และต้องบอกที่มา
 *    ② อ่านทะเบียนไม่ได้ ⇒ **ถอดแถวออกจากแผน** ห้ามถอยไปใช้เลข ZORT
 *       (ZORT ให้ 0 ⇒ ถ้าหลุดเข้าแผน วันที่มีคนส่ง allowClose จะ **ปิดขายของที่มีจริง**)
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { ทับจำนวนด้วยทะเบียน, เป็นของทะเบียน, แถวจากกองเท่ากัน } = await import("../../netlify/lib/licensed-push-qty.mjs");
const m2 = await import("../../netlify/lib/licensed-push-qty.mjs");
const { planFrom } = await import("../../netlify/lib/stock-push.mjs");

const แถว = () => [
  /* ⚠️ ต้องมีแถวผู้ถือกอง `Bar NW 24-9800` ที่โฆษณาอยู่ (>0) ด้วย
     ไม่งั้นด่าน "รอผู้ถือ" จะกัน `24-7800` ไว้ไม่ให้ตั้งเป็น 0 ซึ่งเป็นพฤติกรรมที่ถูก
     ⇒ ของจริงบนแพลตฟอร์มก็ต้องมีทั้งคู่อยู่แล้ว เพราะเป็นตัวเลือกของสินค้าตัวเดียวกัน */
  { sku: "Bar NW 24-9800", name: "บาร์ 24 ผู้ถือ", platformQty: 4, coreQty: 8, known: true },
  { sku: "Bar NW 24-7800", name: "บาร์ 24", platformQty: 0, coreQty: -1, known: true },
  { sku: "Bar NW 22", name: "บาร์ 22", platformQty: 0, coreQty: 0, known: true },
  { sku: "00073", name: "ของธรรมดา", platformQty: 5, coreQty: 7, known: true },
];

test("แยกของทะเบียนออกจากของธรรมดาได้ — จากตารางจับคู่ ไม่ใช่เดาจากชื่อ", () => {
  assert.equal(เป็นของทะเบียน("Bar NW 24-7800"), true);
  assert.equal(เป็นของทะเบียน("F 660"), true);
  // ตัวควบคุมลบ: ชื่อคล้ายแต่ไม่อยู่ในตาราง ต้องไม่ถูกนับ
  for (const s of ["01387", "00073", "Bar NW 99", "Bar NW", "", null, undefined])
    assert.equal(เป็นของทะเบียน(s), false, `${s} ไม่ใช่ของทะเบียน`);
});

test("🔴 อ่านทะเบียนไม่ได้ ⇒ ถอดแถวทะเบียนออกจากแผน ห้ามถอยไปใช้เลข ZORT", async () => {
  /* ในเครื่องเทสไม่มี CLOUDFLARE_D1_TOKEN ⇒ `ทะเบียนเหลือทุกกลุ่ม()` โยน
     ⇒ นี่คือทางที่ของจริงจะเดินตอนฐานล่ม **และเป็นทางที่อันตรายที่สุด** */
  if (process.env.CLOUDFLARE_D1_TOKEN) return; // เครื่องที่ตั้งค่าไว้ ข้ามโดยตั้งใจ
  const r = await ทับจำนวนด้วยทะเบียน(แถว());
  assert.equal(r.licensedApplied, 0);
  assert.ok(r.licensedReadError, "ต้องประกาศว่าอ่านทะเบียนไม่ได้ ไม่ใช่เงียบ");
  assert.match(r.licensedReadError, /CLOUDFLARE_D1_TOKEN|อ่านทะเบียน/, `เหตุต้องบอกได้ว่าอะไร · ได้: ${r.licensedReadError}`);
  // แถวทะเบียนต้องหายจากแผน · แถวธรรมดาต้องอยู่ครบ
  assert.deepEqual(r.rows.map((x) => x.sku), ["00073"], "ต้องเหลือแต่ของธรรมดา");
  assert.deepEqual(r.licensedDropped.map((x) => x.sku).sort(), ["Bar NW 22", "Bar NW 24-7800", "Bar NW 24-9800"]);
  /* 🔑 **ข้อที่สำคัญที่สุดของด่านนี้**: เลข −1 กับ 0 ของ ZORT ต้องไม่ไปถึง planFrom
     ถ้าหลุดไป `Bar NW 22` จะเป็นแถว `same` (0=0) ซึ่งดูไม่มีพิษ
     แต่ `Bar NW 24-7800` จะเข้ากอง `skipNegative` ⇒ กลับไปเป็นอาการเดิมที่เราเพิ่งแก้ */
  const p = planFrom(r.rows, true);
  assert.equal(p.skipNegative, 0, "เลข −1 ของ ZORT ต้องไม่ไปถึงตัวคิดแผน");
  assert.equal(p.platformSkus, 1);
});

test("🧪 ทับได้จริง ⇒ เลขเป็นของทะเบียน · ประกาศที่มา · เก็บเลข ZORT เดิมไว้เทียบ", async () => {
  /* 🔴 **รุ่นแรกของเทสข้อนี้เป็นเขียวลวง — การปลูกจับได้**
     รุ่นแรกผมสร้างแถว `coreFrom: "licensed"` ขึ้นมาเองแล้วตรวจแถวของตัวเอง
     ⇒ ปลูกด้วยการถอด `coreFrom` ออกจากฟังก์ชันจริง **เทสยังเขียว** = ไม่ได้เดินผ่านโค้ดจริงเลย
     ⇒ แก้ให้ฟังก์ชันรับตัวอ่านแบบฉีดได้ แล้วเทสเรียกของจริงและดูของที่มันผลิต */
  const กลุ่ม = new Map([["bar|NEWWAVE 24", 8], ["bar|NEWWAVE 22", 7]]);
  const r = await ทับจำนวนด้วยทะเบียน(แถว(), {
    อ่านกลุ่ม: async () => กลุ่ม,
    อ่านรายรหัส: async (sku, { กลุ่มที่เหลือ }) => {
      assert.ok(กลุ่มที่เหลือ === กลุ่ม, "ต้องส่งแมปที่อ่านมาแล้วต่อไป ไม่ใช่อ่านซ้ำรายรหัส");
      return sku === "Bar NW 24-7800" ? 8 : 7;
    },
  });
  assert.equal(r.licensedApplied, 3, "ผู้ถือ + 24-7800 (pool-zero) + 22");
  assert.equal(r.licensedReadError, null);
  assert.deepEqual(r.licensedDropped, []);
  const หา = (s) => r.rows.find((x) => x.sku === s);
  /* 🧺 **ค่าที่คาดเปลี่ยนเพราะกติกากองร่วม (ทางที่ 1) ไม่ใช่เพราะโค้ดพัง**
     `Bar NW 24-7800` เป็น **ตัวที่ไม่ถือกอง** NEWWAVE 24 (ผู้ถือคือ `24-9800`) ⇒ ต้องได้ 0
     ⇒ ของที่พิสูจน์ว่า "เลขมาจากทะเบียนไม่ใช่ −1 ของ ZORT" ย้ายไปดูที่ `coreQtyZort` กับ `poolQty` */
  assert.equal(หา("Bar NW 24-7800").coreQty, 0, "ตัวที่ไม่ถือกองต้องได้ 0");
  assert.equal(หา("Bar NW 24-7800").poolQty, 8, "ต้องบอกว่ากองมี 8 ⇒ 0 นี้ไม่ใช่ของหมด");
  assert.equal(หา("Bar NW 24-7800").poolHolder, "Bar NW 24-9800");
  assert.equal(หา("Bar NW 22").coreQty, 7);
  /* ทั้งสองแถวต้องประกาศที่มา แต่ **ป้ายคนละค่าโดยตั้งใจ**
     `22` = ผู้ถือ/กองเดี่ยว ⇒ `licensed` · `24-7800` = ตัวที่ไม่ถือกอง ⇒ `licensed-pool-zero`
     ⇒ ป้ายเดียวกันทั้งสองแบบจะทำให้แยกไม่ออกว่า 0 นั้นเพราะของหมด หรือเพราะของอยู่ตัวเลือกอื่น */
  assert.equal(หา("Bar NW 22").coreFrom, "licensed", "ผู้ถือ/กองเดี่ยว ต้องเป็น licensed");
  assert.equal(หา("Bar NW 24-7800").coreFrom, "licensed-pool-zero", "ตัวที่ไม่ถือกอง ต้องเป็น licensed-pool-zero");
  assert.equal(หา("Bar NW 24-7800").coreQtyZort, -1, "ต้องเก็บเลข ZORT เดิมไว้เทียบ");
  assert.equal(หา("00073").coreFrom, undefined, "ของธรรมดาห้ามถูกติดป้าย licensed");

  const p = planFrom(r.rows, true);
  assert.equal(p.skipNegative, 0, "ทับแล้วต้องไม่มีใครติดลบ ⇒ เลิกถูกข้ามทุกรอบ");
  /* 🧺 **reopen เหลือ 1 ไม่ใช่ 2 เพราะกติกากองร่วม — และนั่นคือผลที่ต้องการ**
     `Bar NW 22` (กองเดี่ยว) 0 → 7 = reopen ⇒ ยังต้องให้คนยืนยันรายรหัสตามด่าน ⑥
     `Bar NW 24-7800` (ตัวที่ไม่ถือกอง) 0 → 0 = `same` ⇒ ตกออกจากแผนไปเลย
     ⚠️ **ตกกอง `same` ที่นี่ถูกต้อง** เพราะโฆษณา 0 เท่ากับของที่ตัวเลือกนี้ควรมี (0)
        ต่างจากเคสที่คุณ CEO เตือน ซึ่งเป็นการ "ตรงรายตัวแต่ผิดระดับกอง" */
  assert.equal(p.reopen, 1, "เหลือแต่ผู้ถือ/กองเดี่ยวที่เป็น reopen");
  assert.equal(p.same, 1, "ตัวที่ไม่ถือกอง 0 → 0 ต้องตกกอง same");
  /* ของทะเบียนสองแถวต้องอยู่กอง reopen ทั้งคู่ · ห้ามหลุดไป close/down (ทิศลงผิด = ปิดขายของที่มี)
     ⚠️ `up` ต้องเป็น 1 เพราะแถวของธรรมดา `00073` (5 → 7) **เป็น up โดยถูกต้อง**
        เทสรุ่นแรกผมเขียนว่า up+close+down ต้องเป็น 0 ⇒ แดง เพราะผมลืมนับแถวควบคุมของตัวเอง
        ⇒ **เทสผิด ไม่ใช่โค้ดผิด** · และถ้าเขียนให้ผ่านด้วยการลบแถวควบคุมออก
          จะเสียตัวควบคุมที่พิสูจน์ว่าของธรรมดาไม่ถูกแตะ */
  assert.equal(p.close, 0, "ของทะเบียนห้ามเข้ากอง close");
  assert.equal(p.down, 0, "ของทะเบียนห้ามเข้ากอง down");
  assert.equal(p.up, 2, "up = ของธรรมดา 00073 (5→7) + ผู้ถือกอง 24-9800 (4→8)");
});

test("ของธรรมดาต้องไม่ถูกแตะเลย (ตัวควบคุมลบ)", async () => {
  const เดิม = [{ sku: "00073", name: "ของธรรมดา", platformQty: 5, coreQty: 7, known: true }];
  const r = await ทับจำนวนด้วยทะเบียน(เดิม);
  assert.equal(r.licensedApplied, 0);
  assert.equal(r.licensedReadError, null, "ไม่มีของทะเบียนในแถว ⇒ ต้องไม่ไปแตะฐานเลย");
  assert.deepEqual(r.rows, เดิม, "แถวของธรรมดาต้องเหมือนเดิมทุกช่อง");
  assert.deepEqual(r.licensedDropped, []);
});

/* ══════ รูที่คุณ CEO จับได้ 5 ต.ค. 2569 — ตัวนับนับความสำเร็จของสิ่งที่ถูกทิ้ง ══════ */

test("🔴 แถว known:false ⇒ ไม่ทับ ไม่นับ แต่ต้องมีชื่อในกองที่มองเห็น", async () => {
  /* `planFrom` ตีตก `!r.known` **ก่อนดู `coreQty`** ⇒ ทับไปก็ถูกทิ้ง
     รุ่นแรกของผมทับแล้วนับว่าสำเร็จ ⇒ คุณ CEO รันของจริงได้ `licensedApplied: 1` แต่ `wouldPush: 0`

     🚫 และ **ห้ามแก้ด้วยการยก `known` เป็น true เอง** — `known` หมายถึง "คลังเรารู้จักรหัสนี้"
        เป็นช่องของตัวเทียบ เปลี่ยนความหมายจะกระทบคนอ่าน `skipUnknown` ทั้งหมด
        (รอบแรกผมยก `known` ตามจดหมายที่บอกว่าเลื่อย 4 รุ่นมาในกองนี้ · คุณ CEO แก้จดหมายเองว่า
         ข้อนั้นผิด เขาปน ZORT กับคลัง D1 · ผมยิงวัดเองยืนยัน: `skipUnknown` ของทั้งสามเจ้า
         **ไม่มีรหัสทะเบียนเลยสักตัว** ⇒ ทางที่ผมเพิ่งเขียนเป็นทางที่ไม่มีใครเดิน) */
  const r = await ทับจำนวนด้วยทะเบียน(
    [{ sku: "F 660", name: "เลื่อย F660", platformQty: 0, coreQty: null, known: false }],
    { อ่านกลุ่ม: async () => new Map([["saw|NEWWAVE F660", 20]]), อ่านรายรหัส: async () => 20 }
  );
  assert.equal(r.licensedApplied, 0, "🔴 นับว่าสำเร็จทั้งที่ถูกทิ้ง = ข่าวดีปลอม (รูที่ CEO จับได้)");
  assert.equal(r.licensedNotInWarehouse.length, 1, "ต้องมีชื่ออยู่ในกองที่มองเห็น ไม่ใช่เงียบ");
  assert.equal(r.licensedNotInWarehouse[0].ทะเบียน, 20, "ต้องบอกด้วยว่าทะเบียนมีเท่าไหร่ ⇒ คนตามแก้ได้");
  assert.equal(r.rows[0].known, false, "ห้ามยก known — ช่องนั้นไม่ใช่ของไฟล์นี้");
  assert.equal(r.rows[0].coreFrom, undefined, "ห้ามติดป้ายว่าทับแล้ว เพราะไม่ได้ทับ");
  assert.equal(r.rows[0].coreQty, null, "ห้ามแตะจำนวนเลย");
  const p = planFrom(r.rows, true);
  assert.equal(p.wouldPush, 0);
  assert.equal(p.skipUnknown, 1, "ยังอยู่กองข้ามตามกติกาเดิมของตัวคิดแผน");
});

test("🔑 planFrom ต้องส่ง coreFrom/coreQtyZort ต่อ — และแถวที่ไม่ได้ทับห้ามมีช่องนั้นเลย", () => {
  /* 🔴 วัดเจอของจริง 6 ต.ค. 2569 00:05 บน production:
     แถวในแผนมีช่องแค่ ['delta','from','kind','name','sku','to']
     ⇒ ป้าย `coreFrom` ที่ตัวทับติดไว้ **หายที่ขาออกของ planFrom**
     ⇒ คนอ่านแผนแยกไม่ออกว่าแถวไหนใช้เลขทะเบียน ⇒ ของที่สร้างมาตอบคำถามนี้ตอบไม่ได้
     ⚠️ ตัวควบคุมลบสำคัญเท่ากัน: **แถวของธรรมดาต้องไม่มีช่องนี้เลย**
        ถ้ามีทุกแถว การ "มีช่อง" จะเลิกมีความหมาย (คุณ CEO กำกับไว้: ห้ามใส่ coreFrom แบบเดา) */
  const p = planFrom([
    { sku: "Bar NW 22", name: "บาร์ 22", platformQty: 0, coreQty: 7, coreFrom: "licensed", coreQtyZort: 0, known: true },
    { sku: "00073", name: "ของธรรมดา", platformQty: 5, coreQty: 7, known: true },
  ], true);
  const หา = (s) => p.push.find((x) => x.sku === s);
  assert.equal(หา("Bar NW 22").coreFrom, "licensed", "ป้ายที่มาต้องถึงคนอ่านแผน");
  assert.equal(หา("Bar NW 22").coreQtyZort, 0, "ต้องส่งเลข ZORT เดิมไปด้วยให้เทียบได้");
  assert.ok(!("coreFrom" in หา("00073")), "แถวที่ไม่ได้ทับห้ามมีช่อง coreFrom เลย ไม่ใช่ค่าว่าง");
  assert.ok(!("coreQtyZort" in หา("00073")), "แถวที่ไม่ได้ทับห้ามมีช่อง coreQtyZort เลย");
});

/* ══════ ยกรหัสทะเบียนจากกอง `same` เข้าแผน (6 ต.ค. 2569) ══════ */

test("🔑 แถวจากกองเท่ากัน ⇒ เข้า rows ได้ · และแถวที่จับคู่แบบเดาห้ามเข้า", () => {
  const r = แถวจากกองเท่ากัน([
    { sku: "Bar NW 22", name: "บาร์ 22", lazada: 0, core: 0, directQty: 0, exact: true, matchedAs: "ตรงตัว" },
    { sku: "Bar NW 20", lazada: 3, core: 3, exact: false, matchedAs: "ตัดท้ายเป็น Bar NW" },
  ], "lazada");
  assert.equal(r.rows.length, 1, "แถว exact:false ต้องไม่เข้า rows");
  assert.equal(r.rows[0].sku, "Bar NW 22");
  assert.equal(r.rows[0].platformQty, 0, "ต้องอ่านจากช่องของเจ้านั้น (lazada)");
  assert.equal(r.rows[0].known, true);
  assert.equal(r.เดา.length, 1);
  assert.equal(r.เดา[0].sku, "Bar NW 20");
  assert.match(r.เดา[0].เหตุ, /เดา/, "ต้องบอกว่าทำไมไม่เข้าแผน ⇒ ความรู้ว่าเดาต้องไม่หายที่รอยต่อ");
});

test("Shopee/TikTok ไม่มีช่อง exact ⇒ ต้องถือว่าตรงตัว ห้ามอ่านว่าเดา (ตัวควบคุมลบ)", () => {
  /* 🔴 ถ้าเขียน `!r.exact` แทน `r.exact === false` ⇒ `undefined` จะกลายเป็น "เดา"
     ⇒ Shopee กับ TikTok จะไม่มีแถวเข้าแผนเลยสักตัว **และเงียบ** */
  for (const [ช่อง, แถว] of [["shopee", { sku: "Bar NW 16", name: "x", shopee: 0, core: 0 }],
                              ["tiktok", { sku: "Bar NW 18", name: "y", tiktok: 2, core: 2 }]]) {
    const r = แถวจากกองเท่ากัน([แถว], ช่อง);
    assert.equal(r.rows.length, 1, `${ช่อง}: ไม่มีช่อง exact ⇒ ต้องเข้า rows`);
    assert.equal(r.เดา.length, 0);
  }
});

test("อ่านจำนวนฝั่งแพลตฟอร์มไม่ได้ ⇒ ไม่เดาว่า 0 (ชื่อช่องผิดก็ตกทางนี้)", () => {
  for (const v of [null, undefined, "", "สาม", NaN]) {
    const r = แถวจากกองเท่ากัน([{ sku: "Bar NW 16", shopee: v, core: 9 }], "shopee");
    assert.equal(r.rows.length, 0, `platformQty=${JSON.stringify(v)} ⇒ ห้ามเข้าแผน`);
    assert.equal(r.เดา.length, 1);
  }
  // ตัวควบคุมบวก: 0 เป็นเลขที่อ่านได้จริง ⇒ ต้องเข้าแผน (0 ≠ ไม่รู้)
  assert.equal(แถวจากกองเท่ากัน([{ sku: "Bar NW 16", shopee: 0, core: 9 }], "shopee").rows.length, 1);
  // ส่งชื่อช่องผิด ⇒ อ่านไม่ได้ ⇒ ตกทาง "ไม่เดา" ไม่ใช่เข้าแผนด้วยเลขมั่ว
  assert.equal(แถวจากกองเท่ากัน([{ sku: "Bar NW 16", shopee: 0, core: 9 }], "ชื่อผิด").rows.length, 0);
});

test("ไม่มี sameListed (ตัวเทียบรุ่นเก่า หรือไม่ส่ง alsoList) ⇒ ต้องไม่พัง และไม่ยกอะไร", () => {
  for (const v of [undefined, null, []]) {
    const r = แถวจากกองเท่ากัน(v, "shopee");
    assert.deepEqual(r.rows, []);
    assert.deepEqual(r.เดา, []);
  }
});

/* ══════ กองร่วม — ทางที่ 1 ที่ท่านประธานเลือก 6 ต.ค. 2569 ══════ */

test("🔴 ทุกกองที่มีหลายตัวเลือก ต้องมีตัวถือกองระบุไว้ — และผู้ถือต้องอยู่ในกองนั้นจริง", async () => {
  /* 🔑 ถ้ากองใหม่โผล่มาแล้วไม่มีใครถือ ทุกตัวเลือกจะได้เลขเต็มกอง
     ⇒ โฆษณาของกองเดียวหลายรอบ **และไม่มีอะไรฟ้อง** เพราะแต่ละแถวถูกรายตัว
     (ความผิดอยู่ระดับกอง ซึ่งแผนดันสต็อกมองไม่เห็นโดยนิยาม) */
  const { ตัวถือกอง, ถูกกองร่วมตั้งเป็นศูนย์ } = m2;
  const { รหัสเป็นกลุ่มทะเบียน, คีย์กลุ่ม } = await import("../../netlify/lib/core-registry.mjs");
  const กอง = new Map();
  for (const [sku, g] of Object.entries(รหัสเป็นกลุ่มทะเบียน)) {
    const k = คีย์กลุ่ม(g.kind, g.ชื่อ);
    if (!กอง.has(k)) กอง.set(k, []);
    กอง.get(k).push(sku);
  }
  const ร่วม = [...กอง].filter(([, v]) => v.length > 1);
  assert.ok(ร่วม.length >= 5, `คาดว่ามีกองร่วมอย่างน้อย 5 กอง · เจอ ${ร่วม.length}`);
  for (const [k, skus] of ร่วม) {
    const ผู้ถือ = ตัวถือกอง[k];
    assert.ok(ผู้ถือ, `กอง ${k} มี ${skus.length} ตัวเลือกแต่ไม่มีตัวถือกอง ⇒ จะโฆษณาเกิน`);
    assert.ok(skus.includes(ผู้ถือ), `ผู้ถือ ${ผู้ถือ} ไม่ได้อยู่ในกอง ${k} (${skus.join(", ")})`);
    // ตัวที่ไม่ใช่ผู้ถือ ต้องถูกตั้งเป็น 0 และบอกได้ว่าใครถือ
    for (const s of skus) {
      const ได้ = ถูกกองร่วมตั้งเป็นศูนย์(s);
      if (s === ผู้ถือ) assert.equal(ได้, null, `${s} เป็นผู้ถือ ต้องไม่ถูกตั้งเป็น 0`);
      else assert.equal(ได้, ผู้ถือ, `${s} ต้องถูกตั้งเป็น 0 และชี้ไปที่ ${ผู้ถือ}`);
    }
  }
  // ตัวควบคุมลบ: กองเดี่ยวและของที่ไม่ใช่ทะเบียน ต้องไม่ถูกแตะ
  for (const s of ["Bar KK 42-381", "Bar NW 16", "F 660", "01387", "00073", null])
    assert.equal(ถูกกองร่วมตั้งเป็นศูนย์(s), null, `${s} ไม่ควรถูกกองร่วมตั้งเป็น 0`);
  // ตัวถือกองทุกตัวต้องเป็นรหัสทะเบียนจริง (กันพิมพ์ผิด)
  for (const [k, ผู้ถือ] of Object.entries(ตัวถือกอง))
    assert.ok(ผู้ถือ in รหัสเป็นกลุ่มทะเบียน, `ผู้ถือของ ${k} (${ผู้ถือ}) ไม่ใช่รหัสทะเบียน — พิมพ์ผิด?`);
});

test("🧺 ทับแล้ว ผู้ถือได้เลขเต็มกอง · ตัวอื่นได้ 0 พร้อมบอกว่าใครถือ (ไม่ใช่ 'ของหมด')", async () => {
  const r = await ทับจำนวนด้วยทะเบียน([
    /* ⚠️ ผู้ถือต้อง `platformQty > 0` เพื่อเดินทาง "ปิดตัวที่ไม่ถือได้"
       ถ้าผู้ถือเป็น 0 ด่าน "รอผู้ถือ" จะกันไว้ (มีเทสของตัวเองข้างล่าง) */
    { sku: "Bar NW 28-7800", name: "28 (7800)", platformQty: 5, coreQty: 0, known: true },
    { sku: "Bar NW 28-8800", name: "28 (8800)", platformQty: 2, coreQty: 0, known: true },
  ], { อ่านกลุ่ม: async () => new Map([["bar|NEWWAVE 28", 19]]), อ่านรายรหัส: async () => 19 });
  const หา = (s) => r.rows.find((x) => x.sku === s);
  assert.equal(หา("Bar NW 28-7800").coreQty, 19, "ผู้ถือต้องได้เลขเต็มกอง");
  assert.equal(หา("Bar NW 28-7800").coreFrom, "licensed");
  assert.equal(หา("Bar NW 28-8800").coreQty, 0, "ตัวที่ไม่ถือต้องเป็น 0 ไม่ใช่ 19");
  assert.equal(หา("Bar NW 28-8800").coreFrom, "licensed-pool-zero", "ต้องติดป้ายแยก");
  assert.equal(หา("Bar NW 28-8800").poolHolder, "Bar NW 28-7800", "ต้องบอกว่าของอยู่ที่ไหน");
  assert.equal(หา("Bar NW 28-8800").poolQty, 19, "ต้องบอกว่ากองมีเท่าไหร่ ⇒ 0 นี้ไม่ใช่ของหมด");
  assert.equal(r.licensedApplied, 2, "นับทั้งสองแถวว่าทับแล้ว");
  /* 🔑 ผลที่ตามมาในแผน: ผู้ถือเป็น reopen (รออนุมัติ) · ตัวที่ไม่ถือเป็น close (ต้องสั่ง allowClose)
     รวมกันแล้วโฆษณา 19 ไม่ใช่ 38 */
  const p = planFrom(r.rows, true);
  const พบ = Object.fromEntries(p.push.map((x) => [x.sku, x]));
  assert.equal(พบ["Bar NW 28-7800"].kind, "up", "ผู้ถือ 5 → 19 คือ up (ไม่ใช่ reopen เพราะ from ไม่ใช่ 0)");
  assert.equal(พบ["Bar NW 28-8800"].kind, "close");
  assert.equal(พบ["Bar NW 28-8800"].poolHolder, "Bar NW 28-7800", "ป้ายต้องถึงคนอ่านแผนด้วย");
  assert.equal(พบ["Bar NW 28-7800"].to + พบ["Bar NW 28-8800"].to, 19, "ยอดโฆษณารวมต้องเท่ากองเดียว");
});

test("🔴🔴 ห้ามปิดตัวที่ไม่ถือกอง ขณะที่ผู้ถือยังโฆษณา 0 — ไม่งั้นกองนั้นโฆษณา 0 ทั้งที่มีของ", async () => {
  /* ของจริงบน Shopee 6 ต.ค. 2569 — คุณ CEO จับได้ก่อน push:
     กอง KINGKONG 30 โฆษณา 8 ซึ่งถูกเป๊ะ ผ่าน `30-070` ตัวเดียว · ผู้ถือ `30-381` อยู่ที่ 0 (รอท่านยืนยัน)
     ⇒ ถ้าปิด `30-070` กองนั้นโฆษณา 0 = เลิกขายของจริง 8 แผ่น
     🔑 และมันเกิดเอง เพราะ `STOCK_PUSH_ALLOW_CLOSE !== "0"` = เปิดทิศลงอัตโนมัติ
        ขณะที่ `reopen` ต้องมีคนยืนยัน ⇒ **ฝั่งอันตรายคือฝั่งที่ทำง่ายกว่า** */
  const อ่าน = { อ่านกลุ่ม: async () => new Map([["bar|KINGKONG 30", 8]]), อ่านรายรหัส: async () => 8 };
  // ผู้ถือยังไม่โฆษณา (0) ⇒ ห้ามปิดตัวที่ไม่ถือ
  const รอ = await ทับจำนวนด้วยทะเบียน([
    { sku: "Bar KK 30-381", name: "ผู้ถือ", platformQty: 0, coreQty: 0, known: true },
    { sku: "Bar KK 30-070", name: "ไม่ถือ", platformQty: 8, coreQty: 8, known: true },
  ], อ่าน);
  const ก = รอ.rows.find((x) => x.sku === "Bar KK 30-070");
  assert.equal(ก.coreQty, 8, "ต้องไม่ถูกตั้งเป็น 0 ⇒ ของยังขายได้");
  assert.equal(ก.coreFrom, undefined, "ไม่ได้ทับ ⇒ ห้ามติดป้าย");
  assert.equal(รอ.licensedPoolWaiting.length, 1, "ต้องมีชื่ออยู่ในกองที่เห็น ไม่ใช่เงียบ");
  assert.equal(รอ.licensedPoolWaiting[0].poolHolder, "Bar KK 30-381");
  assert.equal(รอ.licensedPoolWaiting[0].poolQty, 8, "ต้องบอกว่ากองมีเท่าไหร่ ⇒ คนเห็นความเสี่ยง");
  const p1 = planFrom(รอ.rows, true);
  assert.equal(p1.close + p1.down, 0, "🔴 ห้ามมีแถวทิศลงเลย — ทิศลงยิงอัตโนมัติได้");

  // ✅ ตัวควบคุมบวก: ผู้ถือโฆษณาอยู่แล้ว (เช่น KK36 ที่ผู้ถืออยู่ที่ 2) ⇒ ปิดตัวที่ไม่ถือได้
  const ได้ = await ทับจำนวนด้วยทะเบียน([
    { sku: "Bar KK 30-381", name: "ผู้ถือ", platformQty: 8, coreQty: 8, known: true },
    { sku: "Bar KK 30-070", name: "ไม่ถือ", platformQty: 8, coreQty: 8, known: true },
  ], อ่าน);
  const ข = ได้.rows.find((x) => x.sku === "Bar KK 30-070");
  assert.equal(ข.coreQty, 0, "ผู้ถือโฆษณาอยู่แล้ว ⇒ ปิดตัวที่ไม่ถือได้");
  assert.equal(ข.coreFrom, "licensed-pool-zero");
  /* 🕐 ปิดได้แล้ว **แต่ยังต้องมีรายการ** — สถานะ ② "ผู้ถือรับแล้ว รอปิดตัวที่ไม่ถือ"
     เพราะจนกว่าทิศลงจะยิงจริง กองนี้ยังโฆษณาเกินอยู่ (≤1 รอบกวาด)
     ⇒ ว่างเปล่าตรงนี้จะทำให้ช่วงเปลี่ยนผ่านมองไม่เห็น */
  assert.equal(ได้.licensedPoolWaiting.length, 1);
  assert.equal(ได้.licensedPoolWaiting[0].สถานะ, "ผู้ถือรับแล้ว รอปิดตัวที่ไม่ถือ");

  // ⚠️ ผู้ถือไม่อยู่ใน rows เลย หรืออ่านเลขไม่ได้ ⇒ ไม่รู้ ⇒ ไม่ปิด
  for (const ผู้ถือ of [undefined, { sku: "Bar KK 30-381", platformQty: null, coreQty: 0, known: true },
                        { sku: "Bar KK 30-381", platformQty: "", coreQty: 0, known: true }]) {
    const แถว = [{ sku: "Bar KK 30-070", name: "ไม่ถือ", platformQty: 8, coreQty: 8, known: true }];
    if (ผู้ถือ) แถว.unshift(ผู้ถือ);
    const r = await ทับจำนวนด้วยทะเบียน(แถว, อ่าน);
    assert.equal(r.rows.find((x) => x.sku === "Bar KK 30-070").coreQty, 8,
      `ผู้ถือ=${JSON.stringify(ผู้ถือ?.platformQty)} ⇒ ไม่รู้ว่าโฆษณาอยู่ไหม ⇒ ห้ามปิด`);
    assert.equal(r.licensedPoolWaiting.length, 1);
  }
});

test("🕐 licensedPoolWaiting ต้องแยกสองสถานะ — เลขเกินคนละทิศ (คุณ CEO ขอ 6 ต.ค. 2569)", async () => {
  /* เหตุผลเดียวกับที่แยก `licensed-pool-zero` ออกจาก `licensed`:
     สองสถานะนี้ **เกินคนละทิศและแก้คนละวิธี** ⇒ ยุบเป็นกองเดียวแล้วคนอ่านตัดสินใจผิด
       ① รอผู้ถือรับของ — ยังไม่ปิดตัวที่ไม่ถือ · ของยังขายได้ · **ห้ามไปเร่งปิด**
       ② ผู้ถือรับแล้ว รอปิดตัวที่ไม่ถือ — ปิดแล้วในแผน แต่ยังโฆษณาเกินจนทิศลงยิงจริง
          **ของนี้หายเองในรอบกวาดถัดไป (≤15 นาที) ⇒ ห้ามไปรื้อด่าน** */
  const อ่าน = { อ่านกลุ่ม: async () => new Map([["bar|KINGKONG 30", 8]]), อ่านรายรหัส: async () => 8 };
  const หนึ่ง = await ทับจำนวนด้วยทะเบียน([
    { sku: "Bar KK 30-381", platformQty: 0, coreQty: 0, known: true },
    { sku: "Bar KK 30-070", platformQty: 8, coreQty: 8, known: true },
  ], อ่าน);
  assert.equal(หนึ่ง.licensedPoolWaiting[0].สถานะ, "รอผู้ถือรับของ");
  assert.equal(หนึ่ง.licensedPoolWaiting[0].holderPlatformQty, 0);
  assert.equal(หนึ่ง.licensedPoolWaiting[0].โฆษณาเกิน, 0, "กองโฆษณา 8 จากของ 8 ⇒ ไม่เกิน");

  const สอง = await ทับจำนวนด้วยทะเบียน([
    { sku: "Bar KK 30-381", platformQty: 8, coreQty: 8, known: true },
    { sku: "Bar KK 30-070", platformQty: 8, coreQty: 8, known: true },
  ], อ่าน);
  const w = สอง.licensedPoolWaiting[0];
  assert.equal(w.สถานะ, "ผู้ถือรับแล้ว รอปิดตัวที่ไม่ถือ");
  assert.equal(w.โฆษณาเกิน, 8, "โฆษณา 8+8=16 จากของ 8 ⇒ เกิน 8 ชั่วคราว");
  assert.match(w.เหตุ, /1 รอบกวาด/, "ต้องบอกขนาดและระยะเวลา ⇒ คนรอบหน้าไม่นึกว่าด่านพัง");
  // และสถานะ ② ต้องมาคู่กับการปิดในแผนจริง (ไม่ใช่แค่รายงานแล้วไม่ทำ)
  assert.equal(สอง.rows.find((x) => x.sku === "Bar KK 30-070").coreQty, 0);
  // 🔑 สองสถานะต้องไม่ใช่ค่าเดียวกัน ไม่งั้นการแยกไม่มีความหมาย
  assert.notEqual(หนึ่ง.licensedPoolWaiting[0].สถานะ, w.สถานะ);
});
