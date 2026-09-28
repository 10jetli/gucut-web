/* 🔴 ด่าน: **สายที่บอกลูกค้าว่า "พัสดุออกแล้ว" ห้ามแปลความล้มเหลวเป็นข่าวดี**
 *    (ใบ t_muacc3nw · 28 ก.ย. 2569 — คลาส "อ่านไม่ได้ ⇒ ตอบเหมือนของว่าง")
 *
 * ของเดิม `zortGetOrder()` คืน `null` ทั้งสามกรณี:
 *   ① ZORT ยืนยันว่าไม่มีใบนี้   ② ถามไม่ได้ (ไม่มีคีย์ / เน็ตล่ม / ZORT ตอบ 5xx)   ③ ตอบมาแต่อ่านไม่ออก
 * ⇒ ผู้เรียกเขียน `if (!z) continue` ได้อย่างเป็นธรรมชาติ แล้วสามกรณีกลายเป็นกรณีเดียว
 * ⇒ `syncShippingAll` เพิ่ม `checked++` **ก่อน**ถาม ⇒ ZORT ล่ม = คืน `{checked:10, shipped:0}`
 *    ซึ่งอ่านว่า **"ตรวจครบแล้ว ไม่มีใบไหนจัดส่ง"** ทั้งที่ไม่เคยถามสำเร็จเลยสักใบ
 * ⇒ ความเสียหายจริง: ลูกค้าไม่ได้รับแจ้งว่าพัสดุออกแล้ว และ **ไม่มีตัวเลขไหนฟ้อง**
 *
 * 🔑 ด่านนี้อยู่ระดับ ① (เรียกฟังก์ชันจริง) ไม่ใช่ระดับอ่านซอร์ส:
 *    ปลอม `globalThis.fetch` แทน ZORT + ส่ง `store` ปลอมเข้า `syncShippingAll` ตรง ๆ
 *    ⇒ ตัวที่พิสูจน์ว่า "ผลต่างกัน" คือ **ค่าที่ฟังก์ชันคืน** ไม่ใช่ตัวด่านเอง (กติกา ⑤ ที่ตกลงกับฝั่งจอ)
 * ⚠️ ไม่มีอะไรออกนอกเครื่อง — รหัสในเทสเป็นค่าปลอม และทุกคำขอถูก fetch ปลอมรับไว้หมด
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ซอร์สไม่เอาคอมเมนต์, เลขบรรทัด, ปลูกในโค้ด, โหลดผ่านไหม } from "./_src.mjs";
import { ตัดคอมเมนต์ } from "../_strip-comments.mjs";
import { readFileSync } from "node:fs";
import { zortGetOrderResult, zortGetOrder, syncShippingAll } from "../../netlify/lib/zort-order.mjs";

const ไฟล์ = "netlify/lib/zort-order.mjs";
const S = ซอร์สไม่เอาคอมเมนต์(ไฟล์);
const ดิบ = readFileSync(ไฟล์, "utf8");

/* ── สนามทดสอบ: ปลอม fetch + ตั้งรหัสปลอม ───────────────────────────── */
const fetchเดิม = globalThis.fetch;
const envเดิม = {};
const คีย์env = ["ZORT_STORENAME", "ZORT_APIKEY", "ZORT_APISECRET"];

/** ให้ ZORT ปลอมตอบตามที่สั่ง · คืนตัวนับจำนวนครั้งที่ถูกยิง */
function ตั้งZORTปลอม(ตอบ) {
  const นับ = { ครั้ง: 0 };
  globalThis.fetch = async () => {
    นับ.ครั้ง++;
    return ตอบ(นับ.ครั้ง);
  };
  return นับ;
}
const ตอบ200 = (ก้อน) =>
  new Response(JSON.stringify(ก้อน), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
  for (const k of คีย์env) {
    envเดิม[k] = process.env[k];
    process.env[k] = `ค่าปลอมสำหรับเทส-${k}`;
  }
});
afterEach(() => {
  globalThis.fetch = fetchเดิม;
  for (const k of คีย์env) {
    if (envเดิม[k] === undefined) delete process.env[k];
    else process.env[k] = envเดิม[k];
  }
});

/* ══════════ ① zortGetOrderResult — สามสถานะต้องแยกกันจริง ══════════ */

test("🔴 ไม่มีรหัส ZORT ⇒ `ถามได้:false` (ไม่ใช่ 'ไม่มีใบนี้')", async () => {
  for (const k of คีย์env) delete process.env[k];
  const ผล = await zortGetOrderResult("GU-1");
  assert.equal(ผล.ถามได้, false, "ยังไม่ได้ตั้งรหัส = ยังไม่ได้ถาม ⇒ ห้ามบอกว่าไม่มีใบ");
  assert.equal(ผล.ใบ, null);
  assert.match(String(ผล.เหตุ), /รหัส/, `เหตุต้องบอกว่าเป็นเรื่องรหัส · ได้: ${ผล.เหตุ}`);
});

test("🔴 ZORT ตอบ 5xx ⇒ `ถามได้:false` + เหตุมีรหัสสถานะ", async () => {
  ตั้งZORTปลอม(() => new Response("boom", { status: 503 }));
  const ผล = await zortGetOrderResult("GU-1");
  assert.equal(ผล.ถามได้, false);
  assert.match(String(ผล.เหตุ), /503/, `เหตุต้องบอกรหัสสถานะจริง · ได้: ${ผล.เหตุ}`);
});

test("🔴 ตอบ 200 แต่ไม่ใช่ JSON ⇒ `ถามได้:false` (200 ไม่ได้แปลว่าอ่านได้)", async () => {
  ตั้งZORTปลอม(() => new Response("<html>โดนหน้า login</html>", { status: 200 }));
  const ผล = await zortGetOrderResult("GU-1");
  assert.equal(ผล.ถามได้, false);
  assert.match(String(ผล.เหตุ), /JSON/, `ได้: ${ผล.เหตุ}`);
});

test("🔑 **หัวใจของด่านนี้** — ตอบ 200 แต่ไม่มีคีย์ `list` ⇒ `ถามได้:false` ไม่ใช่ 'ไม่มีใบ'", async () => {
  /* ของเดิม `d?.list || d?.List || []` แปลง "รูปคำตอบไม่ใช่อย่างที่คิด" เป็น "ค้นแล้วไม่เจอ"
     ⇒ ZORT เปลี่ยนรูปคำตอบเมื่อไหร่ ทุกใบจะกลายเป็น "ไม่มีในระบบ" เงียบ ๆ ทั้งกระดาน */
  ตั้งZORTปลอม(() => ตอบ200({ status: "ok" }));
  const ไม่มีคีย์ = await zortGetOrderResult("GU-1");
  ตั้งZORTปลอม(() => ตอบ200({ list: [] }));
  const listว่าง = await zortGetOrderResult("GU-1");

  assert.equal(ไม่มีคีย์.ถามได้, false, "ไม่มีคีย์ list = รูปคำตอบผิด ⇒ ยังไม่รู้");
  assert.equal(listว่าง.ถามได้, true, "list ว่าง = ZORT ตอบเองว่าไม่มี ⇒ รู้แล้ว");
  assert.equal(listว่าง.ใบ, null);
  /* 🔑 ข้อพิสูจน์ว่า "ผลต่างกันจริง": สองเคสนี้เคยให้ค่าเท่ากันเป๊ะ (null) */
  assert.notEqual(ไม่มีคีย์.ถามได้, listว่าง.ถามได้,
    "สองเคสนี้ต้องแยกออกจากกันได้ — ของเดิมคืน null ทั้งคู่");
});

test("✅ เจอใบ ⇒ `{ถามได้:true, ใบ}` และต้องเทียบเลขตรงตัว (keyword ค้นกว้าง)", async () => {
  ตั้งZORTปลอม(() =>
    ตอบ200({ list: [{ number: "GU-19", trackingno: "T1" }, { number: "GU-1", trackingno: "T2" }] }));
  const ผล = await zortGetOrderResult("GU-1");
  assert.equal(ผล.ถามได้, true);
  assert.equal(ผล.ใบ?.trackingno, "T2", "ต้องเลือกใบที่เลขตรงตัว ไม่ใช่ใบแรกที่ keyword คืนมา");
});

test("🔴 fetch โยน error (เน็ตล่ม/timeout) ⇒ `ถามได้:false` ไม่ใช่กลืนเงียบ", async () => {
  globalThis.fetch = async () => { throw new Error("เน็ตล่ม"); };
  const ผล = await zortGetOrderResult("GU-1");
  assert.equal(ผล.ถามได้, false);
  assert.match(String(ผล.เหตุ), /เน็ตล่ม/, `เหตุต้องพาข้อความจริงมาด้วย · ได้: ${ผล.เหตุ}`);
});

test("🔁 รูปเดิม `zortGetOrder()` ยังใช้ได้ (คืนใบหรือ null) — ของเก่าไม่พัง", async () => {
  ตั้งZORTปลอม(() => ตอบ200({ list: [{ number: "GU-1" }] }));
  assert.equal((await zortGetOrder("GU-1"))?.number, "GU-1");
  ตั้งZORTปลอม(() => new Response("x", { status: 500 }));
  assert.equal(await zortGetOrder("GU-1"), null, "ถามไม่ได้ ⇒ รูปเดิมยังคืน null ตามสัญญาเดิม");
});

/* ══════════ ② syncShippingAll — เรียกของจริงด้วย store ปลอม ══════════ */

/** store ปลอมที่มีออเดอร์รอส่ง n ใบ (สด ๆ สถานะ new ไม่มีเลขพัสดุ) */
function storeปลอม(n) {
  const ใบ = {};
  for (let i = 1; i <= n; i++) ใบ[`o/GU-${i}`] = { id: `GU-${i}`, status: "new", at: Date.now() };
  const เขียน = [];
  return {
    เขียน,
    async list() { return { blobs: Object.keys(ใบ).map((key) => ({ key })) }; },
    async get(key) { return ใบ[key] ?? null; },
    async setJSON(key, v) { เขียน.push([key, v]); },
  };
}

test("🔴 **ZORT ล่มทั้งรอบ ⇒ ห้ามคืน `checked` ที่อ่านว่า 'ตรวจครบแล้ว'**", async () => {
  const s = storeปลอม(12);
  const นับ = ตั้งZORTปลอม(() => new Response("down", { status: 502 }));
  const r = await syncShippingAll(s);

  assert.equal(r.checked, 0,
    `ถามไม่สำเร็จสักใบ ⇒ checked ต้องเป็น 0 · ได้ ${r.checked} (ของเดิมได้ 10 = "ตรวจครบ ไม่มีใบไหนจัดส่ง")`);
  assert.equal(r.shipped, 0);
  assert.ok(r.askFailed > 0, "ต้องประกาศจำนวนใบที่ถามไม่สำเร็จ");
  assert.ok(r["⚠️ อ่านยังไง"], "ต้องมีคำอธิบายเดินมาพร้อมตัวเลข ไม่ปล่อยให้คนอ่านเดา");
  assert.match(String(r.askFailReason), /502/, `ต้องพาเหตุจริงมา · ได้: ${r.askFailReason}`);
  /* 🔑 ล้มติดกัน 3 ใบต้องหยุด — ไม่ยิงต่อจนฟังก์ชันหมดเวลา (Netlify ให้ 26 วินาที) */
  assert.equal(นับ.ครั้ง, 3,
    `ล้ม 3 ใบติดต้องหยุดยิง · ยิงไป ${นับ.ครั้ง} ครั้ง (ยิงครบ 10 = เผาเวลาทั้งรอบไปกับ ZORT ที่ล่มอยู่)`);
  assert.equal(s.เขียน.length, 0, "ถามไม่ได้ต้องไม่เขียนทับออเดอร์อะไรเลย");
});

test("✅ ZORT ตอบปกติแต่ยังไม่มีเลขพัสดุ ⇒ `checked` เดินหน้า · `askFailed:0` · ไม่มีคำเตือน", async () => {
  const s = storeปลอม(4);
  await ตั้งZORTปลอม(() => ตอบ200({ list: [] }));
  const r = await syncShippingAll(s);
  assert.equal(r.checked, 4, `ถามสำเร็จ 4 ใบ · ได้ ${r.checked}`);
  assert.equal(r.shipped, 0);
  assert.equal(r.askFailed, 0);
  assert.equal(r["⚠️ อ่านยังไง"], undefined,
    "รอบที่ไม่มีอะไรขัดต้องไม่มีคำเตือน — ตัวเตือนที่ร้องใส่ของปกติจะถูกปิดทิ้งใน 1 วัน");
  assert.equal(s.เขียน.length, 0, "ไม่มีอะไรเปลี่ยน ⇒ ไม่เขียนทับ");
});

test("🔑 ล้มสลับสำเร็จ ⇒ ใบที่ถามได้ต้องยังถูกนับ (ห้ามทิ้งทั้งรอบเพราะใบเดียวล้ม)", async () => {
  const s = storeปลอม(6);
  ตั้งZORTปลอม((ครั้ง) => (ครั้ง === 1 ? new Response("x", { status: 500 }) : ตอบ200({ list: [] })));
  const r = await syncShippingAll(s);
  assert.equal(r.askFailed, 1, `ล้มใบเดียว · ได้ ${r.askFailed}`);
  assert.ok(r.checked >= 4, `ใบที่เหลือต้องยังถูกตรวจ · checked = ${r.checked}`);
  assert.ok(r["⚠️ อ่านยังไง"], "ล้มแม้ใบเดียวก็ต้องประกาศ ⇒ รอบนั้นไม่ครบ");
});

/* ══════════ ③ นับประตู — "มีทางออกกี่ทาง" ไม่ใช่ "ทางที่รู้จักยังถูกไหม" ══════════ */

/** ยกก้อน `{...}` ที่เริ่มที่ตำแหน่ง `i` (ต้องชี้ที่ `{`) ออกมาทั้งก้อนด้วยการนับปีกกา
 *  🔴 28 ก.ย. 2569 — เดิมด่านนี้อ่าน **บรรทัดเดียว** แล้วหาคีย์ `ถามได้:`
 *     ฝั่งจอปลูกทางออกหลายบรรทัดที่ **มี** `ถามได้` อยู่บรรทัดถัดไป (โค้ดถูก) ⇒ ด่าน **แดง**
 *     ⇒ นี่คือ **บวกลวง** ไม่ใช่ลบลวง · และบวกลวงคือสิ่งที่ทำให้ด่านถูกถอดทิ้งในอีกสองเดือน
 *       (คนจะแก้ด้วยการถอดเกณฑ์ ไม่ใช่แก้โค้ด — กฎ noise-filters-eat-real-cases) */
function ก้อนปีกกา(s, i) {
  let ลึก = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "{") ลึก++;
    else if (s[j] === "}") { ลึก--; if (ลึก === 0) return s.slice(i, j + 1); }
  }
  return s.slice(i);
}

test("🔴 ทุกทางออกของ `zortGetOrderResult` ต้องประกาศ `ถามได้` (อ่านก้อน ไม่ใช่บรรทัด)", () => {
  const ฐาน = S.indexOf("export async function zortGetOrderResult");
  const ตัว = S.slice(ฐาน);
  const ก้อน = ตัว.slice(0, ตัว.indexOf("\n}\n"));
  const ประตู = [...ก้อน.matchAll(/return\s*\{/g)].map((m) => m.index + m[0].indexOf("{"));
  console.log(`   📏 ทางออกของ zortGetOrderResult ${ประตู.length} ทาง: บรรทัด ` +
    ประตู.map((i) => เลขบรรทัด(S, ฐาน + i)).join(", "));
  assert.ok(ประตู.length >= 6, `คาดว่ามีหลายทางออก · เจอ ${ประตู.length} ⇒ ตะแกรงพัง ไม่ใช่โค้ดสั้น`);
  for (const i of ประตู) {
    const ก้อนนี้ = ก้อนปีกกา(ก้อน, i);
    assert.match(ก้อนนี้, /ถามได้\s*:/,
      `ทางออกที่บรรทัด ${เลขบรรทัด(S, ฐาน + i)} ไม่ประกาศ \`ถามได้\` ` +
        `⇒ ผู้เรียกแยก "ไม่รู้" จาก "ไม่มี" ไม่ออก · ได้: ${ก้อนนี้.replace(/\s+/g, " ").slice(0, 90)}`);
  }
});

test("🧪 ตัวควบคุมสองทิศของด่านข้างบน (ฝั่งจอปลูกจริง 28 ก.ย. — เดิมแดงทั้งคู่ = บวกลวง)", () => {
  const ถูก = "return {\n      ถามได้: false,\n      ใบ: null,\n      เหตุ: 'x',\n    }";
  const ผิด = "return {\n      ใบ: null,\n      เหตุ: 'x',\n    }";
  assert.match(ก้อนปีกกา(ถูก, ถูก.indexOf("{")), /ถามได้\s*:/,
    "ทางออกหลายบรรทัดที่ **มี** ถามได้ ต้องผ่าน — ของเดิมฟ้องเคสนี้ (บวกลวง)");
  assert.ok(!/ถามได้\s*:/.test(ก้อนปีกกา(ผิด, ผิด.indexOf("{"))),
    "ทางออกหลายบรรทัดที่ **ไม่มี** ถามได้ ต้องยังถูกจับได้");
});

test("🔴 `checked++` ต้องมี **ที่เดียว** และอยู่หลังการถาม (นับประตู ไม่ใช่ดูตัวแรก)", () => {
  /* 🔴 ฝั่งจอชี้ว่า `indexOf` เห็นแค่ตัวแรก (28 ก.ย. 2569) — วัดแล้วทิศที่เขากลัวยังแดง
     แต่ข้อสรุปที่ถูกคือ **นับทุกตัว** ไม่ใช่ดูตัวแรก (ท่าเดียวกับที่เราบังคับด่านอื่นอยู่)
     ⚠️ และฝั่งจอวัดได้ว่าเกณฑ์ **ลำดับซอร์ส** ไม่ได้เพิ่มการป้องกันเลยในไฟล์นี้ —
        ตัวที่แบกน้ำหนักทั้งหมดคือเทสพฤติกรรมข้างบน ⇒ เก็บข้อนี้ไว้ในฐานะ "คำอธิบายเจตนา" */
  const ฐาน = S.indexOf("export async function syncShippingAll");
  const ตัว = S.slice(ฐาน);
  const ก้อน = ตัว.slice(0, ตัว.indexOf("\n}\n"));
  const ถาม = [...ก้อน.matchAll(/await zortGetOrderResult\(/g)].map((m) => m.index);
  const นับ = [...ก้อน.matchAll(/checked\+\+/g)].map((m) => m.index);
  console.log(`   📏 จุดถาม ${ถาม.length} จุด · จุดนับ checked ${นับ.length} จุด: บรรทัด ` +
    นับ.map((i) => เลขบรรทัด(S, ฐาน + i)).join(", "));
  assert.equal(ถาม.length, 1, `ควรถาม ZORT จุดเดียว · เจอ ${ถาม.length}`);
  assert.equal(นับ.length, 1, `\`checked++\` ควรมีที่เดียว · เจอ ${นับ.length} ⇒ ไปดูว่าทุกตัวอยู่ในกิ่งที่ถามสำเร็จจริงไหม`);
  for (const i of นับ)
    assert.ok(i > ถาม[0],
      `\`checked++\` ที่บรรทัด ${เลขบรรทัด(S, ฐาน + i)} อยู่ **ก่อน** การถาม ⇒ ความล้มเหลวถูกนับเป็น "ตรวจแล้ว"`);
});

/* ══════════ ตัวควบคุมลบ — ปลูกบั๊กเดิมกลับ แล้ว **ผล** ต้องเปลี่ยน ══════════ */

test("🧪 ตัวควบคุม: ปลูกบั๊กเดิม (`checked++` ก่อนถาม + ข้ามเมื่อไม่มีใบ) ⇒ ผลลัพธ์ต้องกลับไปโกหก", async () => {
  const { ปลูก, บรรทัด } = ปลูกในโค้ด(
    ดิบ,
    `    ยิง++;
    const ผล = await zortGetOrderResult(o.id);
    if (!ผล.ถามได้) {`,
    `    ยิง++;
    checked++;
    const ผล = await zortGetOrderResult(o.id);
    if (false) {`,
    { ไฟล์ }
  );
  console.log(`   🌱 ปลูกบั๊กเดิมที่บรรทัด ${บรรทัด}`);
  โหลดผ่านไหม(ปลูก, "ปลูก-นับก่อนถาม");

  /* 🔑 ตัวที่พิสูจน์ว่า "ผลต่างกัน" ต้องไม่ใช่ตัวด่านเอง ⇒ โหลดโค้ดที่ปลูกแล้ว **รันจริง** */
  const mod = await import(
    "data:text/javascript;base64," + Buffer.from(ปลูก, "utf8").toString("base64"));
  const s = storeปลอม(12);
  ตั้งZORTปลอม(() => new Response("down", { status: 502 }));
  const r = await mod.syncShippingAll(s);
  assert.ok(r.checked > 0,
    `ปลูกบั๊กแล้ว checked ต้องบวกขึ้นทั้งที่ถามไม่สำเร็จ (= ตัวเลขที่โกหก) · ได้ ${r.checked}`);
  console.log(`   📏 โค้ดที่ปลูกบั๊กคืน checked = ${r.checked} ทั้งที่ถาม ZORT ไม่สำเร็จสักใบ`);
});

test("🧪 ตัวควบคุม: ถอดการแยก `list` ที่ไม่ใช่ array ⇒ 'รูปคำตอบผิด' กลับกลายเป็น 'ไม่มีใบ'", async () => {
  const { ปลูก, บรรทัด } = ปลูกในโค้ด(
    ดิบ,
    `    const list = d?.list || d?.List;`,
    `    const list = d?.list || d?.List || [];`,
    { ไฟล์ }
  );
  console.log(`   🌱 ปลูกในโค้ดบรรทัด ${บรรทัด}`);
  const mod = await import(
    "data:text/javascript;base64," + Buffer.from(ปลูก, "utf8").toString("base64"));
  ตั้งZORTปลอม(() => ตอบ200({ status: "ok" }));   // ไม่มีคีย์ list
  const ผล = await mod.zortGetOrderResult("GU-1");
  assert.equal(ผล.ถามได้, true,
    "ปลูกแล้วต้องตอบว่า 'ถามได้' ทั้งที่รูปคำตอบผิด ⇒ เกณฑ์ข้างบนจะแดง");
  console.log("   📏 โค้ดที่ปลูกตอบ {ถามได้:true, ใบ:null} = 'ZORT ยืนยันว่าไม่มีใบนี้' ทั้งที่อ่านคำตอบไม่ออก");
});

test("🔑 **ZORT ติด ๆ ดับ ๆ (ล้มสลับสำเร็จ) ⇒ ห้ามตัดรอบทิ้งเร็วเกินจริง**", async () => {
  /* 🔴 ฝั่งจอจับผมได้ด้วยเคสนี้ (28 ก.ย. 2569): รอบแรกผมเขียน `askFailed >= 3` = นับ **สะสม**
     ทั้งที่คอมเมนต์บอกว่า "ติดกัน" ⇒ ZORT คี่ล้ม/คู่สำเร็จ (ไม่มีช่วงติดกันเลย)
     ⇒ ยิงไป 5 ครั้งแล้วหยุด · เหลืออีก 7 ใบไม่ถูกตรวจ **โดยไม่มีอะไรบอก**
     🔑 ล้มกระจัดกระจาย = ใบบางใบมีปัญหา ไม่ใช่ท่อล่ม ⇒ ต้องเดินต่อ */
  const s = storeปลอม(12);
  const นับ = ตั้งZORTปลอม((ครั้ง) =>
    (ครั้ง % 2 === 1 ? new Response("x", { status: 500 }) : ตอบ200({ list: [] })));
  const r = await syncShippingAll(s);
  assert.equal(นับ.ครั้ง, 10,
    `ล้มสลับสำเร็จต้องเดินจนครบเพดาน 10 ใบ · ยิงไป ${นับ.ครั้ง} ครั้ง (5 = ตัดรอบทิ้งเร็วเกินจริง)`);
  assert.equal(r.checked, 5, `ใบที่ถามสำเร็จต้องถูกนับครบ · ได้ ${r.checked}`);
  assert.equal(r.askFailed, 5);
  assert.match(String(r.stoppedBecause), /เพดาน/,
    `ต้องบอกว่าจบเพราะครบเพดาน ไม่ใช่เพราะ ZORT ล่ม · ได้: ${r.stoppedBecause}`);
});

test("🛑 `stoppedBecause` ต้องแยก 'ไล่ครบคิวแล้ว' ออกจาก 'ถูกตัดกลางทาง'", async () => {
  /* ถ้าไม่มีคีย์นี้ จอเห็น `checked:3` แล้วแยกไม่ออกว่า "มีแค่ 3 ใบในคิว" กับ "ถูกตัดตั้งแต่ใบที่ 4" */
  ตั้งZORTปลอม(() => ตอบ200({ list: [] }));
  const ครบคิว = await syncShippingAll(storeปลอม(3));
  assert.equal(ครบคิว.stoppedBecause, null, "ไล่ครบคิวจริง ⇒ ต้องเป็น null");
  assert.equal(ครบคิว.checked, 3);
  const ชนเพดาน = await syncShippingAll(storeปลอม(15));
  assert.match(String(ชนเพดาน.stoppedBecause), /เพดาน/, `ได้: ${ชนเพดาน.stoppedBecause}`);
  assert.ok(typeof ครบคิว.elapsedMs === "number", "ต้องรายงานเวลาที่ใช้ ⇒ คนดูรู้ว่าใกล้ชนงบเวลาไหม");
});

test("🧪 ตัวควบคุม: เปลี่ยนเพดานกลับไปนับ **สะสม** ⇒ รอบที่ติด ๆ ดับ ๆ ถูกตัดทิ้ง (บั๊กที่ฝั่งจอจับได้)", async () => {
  /* ⚠️ จุดยึดต้องเป็น **โค้ดล้วน** — รอบแรกผมใส่หัวคอมเมนต์ (`//`) ติดมาด้วย
     แล้ว `ปลูกในโค้ด` ตีกลับเองว่า "เจอในซอร์สดิบแต่ไม่เจอในโค้ด ⇒ ปลูกที่นั่นจะได้ผลลวง"
     ⇒ ด่านที่ผมสร้างไว้กันคลาส "ด่านที่คอมเมนต์ของตัวเองทำให้พอใจ" ทำงานถูกต้อง */
  const { ปลูก, บรรทัด } = ปลูกในโค้ด(ดิบ, `    ล้มติดกัน = 0;`, `    void 0;`, { ไฟล์ });
  console.log(`   🌱 ถอดการรีเซ็ตตัวนับที่บรรทัด ${บรรทัด} (= กลับไปนับสะสม)`);
  โหลดผ่านไหม(ปลูก, "ปลูก-นับสะสม");
  const mod = await import(
    "data:text/javascript;base64," + Buffer.from(ปลูก, "utf8").toString("base64"));
  const นับ = ตั้งZORTปลอม((ครั้ง) =>
    (ครั้ง % 2 === 1 ? new Response("x", { status: 500 }) : ตอบ200({ list: [] })));
  const r = await mod.syncShippingAll(storeปลอม(12));
  assert.equal(นับ.ครั้ง, 5,
    `ปลูกแล้วต้องหยุดที่ 5 ครั้ง (= บั๊กเดิม) · ได้ ${นับ.ครั้ง} ⇒ เกณฑ์ข้างบนจะแดง`);
  console.log(`   📏 โค้ดที่ปลูกหยุดที่ ${นับ.ครั้ง} ครั้ง · checked=${r.checked} ⇒ เหลือ 7 ใบไม่ถูกตรวจเงียบ ๆ`);
});

test("🧪 ตัวควบคุม: ถอดเพดาน 'ล้มติดกัน 3 ใบ' ⇒ ยิงต่อจนครบ 10 (เผาเวลาทั้งรอบ)", async () => {
  const { ปลูก, บรรทัด } = ปลูกในโค้ด(
    ดิบ,
    `    if (ล้มติดกัน >= 3) { หยุดเพราะ = "ถาม ZORT ล้มติดกัน 3 ใบ ⇒ ถือว่า ZORT ใช้ไม่ได้อยู่"; break; }`,
    "",
    { ไฟล์ }
  );
  console.log(`   🌱 ถอดเพดานที่บรรทัด ${บรรทัด}`);
  const โค้ด = ตัดคอมเมนต์(ปลูก, ไฟล์, { คงเลขบรรทัด: true });
  assert.ok(!/ล้มติดกัน >= 3/.test(โค้ด), "ปลูกแล้วเพดานต้องหายจากโค้ด");
  const mod = await import(
    "data:text/javascript;base64," + Buffer.from(ปลูก, "utf8").toString("base64"));
  const นับ = ตั้งZORTปลอม(() => new Response("down", { status: 502 }));
  await mod.syncShippingAll(storeปลอม(12));
  assert.equal(นับ.ครั้ง, 10, `ถอดเพดานแล้วต้องยิงครบ 10 · ได้ ${นับ.ครั้ง} ⇒ เกณฑ์ข้างบนจะแดง`);
});
