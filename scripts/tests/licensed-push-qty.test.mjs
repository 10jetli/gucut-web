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
const { planFrom } = await import("../../netlify/lib/stock-push.mjs");

const แถว = () => [
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
  assert.deepEqual(r.licensedDropped.map((x) => x.sku).sort(), ["Bar NW 22", "Bar NW 24-7800"]);
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
  assert.equal(r.licensedApplied, 2);
  assert.equal(r.licensedReadError, null);
  assert.deepEqual(r.licensedDropped, []);
  const หา = (s) => r.rows.find((x) => x.sku === s);
  assert.equal(หา("Bar NW 24-7800").coreQty, 8, "เลขต้องมาจากทะเบียน ไม่ใช่ −1 ของ ZORT");
  assert.equal(หา("Bar NW 22").coreQty, 7);
  for (const s of ["Bar NW 24-7800", "Bar NW 22"]) {
    assert.equal(หา(s).coreFrom, "licensed", `${s} ต้องประกาศที่มาของเลข — ไม่งั้นวันที่เลขต่างจาก ZORT ไม่มีใครตอบได้ว่ามาจากไหน`);
  }
  assert.equal(หา("Bar NW 24-7800").coreQtyZort, -1, "ต้องเก็บเลข ZORT เดิมไว้เทียบ");
  assert.equal(หา("00073").coreFrom, undefined, "ของธรรมดาห้ามถูกติดป้าย licensed");

  const p = planFrom(r.rows, true);
  assert.equal(p.skipNegative, 0, "ทับแล้วต้องไม่มีใครติดลบ ⇒ เลิกถูกข้ามทุกรอบ");
  assert.equal(p.reopen, 2, "0 → มากกว่า 0 ต้องเป็น reopen ⇒ ด่าน ⑥ ยังบังคับให้ยืนยันรายรหัส");
  /* ของทะเบียนสองแถวต้องอยู่กอง reopen ทั้งคู่ · ห้ามหลุดไป close/down (ทิศลงผิด = ปิดขายของที่มี)
     ⚠️ `up` ต้องเป็น 1 เพราะแถวของธรรมดา `00073` (5 → 7) **เป็น up โดยถูกต้อง**
        เทสรุ่นแรกผมเขียนว่า up+close+down ต้องเป็น 0 ⇒ แดง เพราะผมลืมนับแถวควบคุมของตัวเอง
        ⇒ **เทสผิด ไม่ใช่โค้ดผิด** · และถ้าเขียนให้ผ่านด้วยการลบแถวควบคุมออก
          จะเสียตัวควบคุมที่พิสูจน์ว่าของธรรมดาไม่ถูกแตะ */
  assert.equal(p.close, 0, "ของทะเบียนห้ามเข้ากอง close");
  assert.equal(p.down, 0, "ของทะเบียนห้ามเข้ากอง down");
  assert.equal(p.up, 1, "เหลือ up แค่แถวของธรรมดา 00073 (5 → 7)");
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
