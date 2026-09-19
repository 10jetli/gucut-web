/* ด่านของเส้นสรุปเวลาต่อรอบ (`?sweeptiming=1`)
 *
 * 🔴 ที่มา 19 ก.ย. 2569: ใบงานสั่งให้ **ยิงงานตามเวลา 4 ตัวเพื่อจับเวลา**
 *    ฝั่งจอค้าน และเขาถูก: ท่อจด `ms` ลง `push_sweep_log` **ทุกรอบอยู่แล้ว**
 *    ⇒ ยิงเพิ่มคือ **สร้างข้อมูลใหม่เพื่อวัดของที่มีข้อมูลอยู่แล้ว** และได้แค่ตัวอย่างที่เราสร้างเอง
 * 🔑 เกณฑ์: **ก่อนยิงวัด ถามว่าระบบจดค่านั้นไว้อยู่แล้วหรือยัง**
 *
 * เรื่องที่เฝ้า
 *  ① ต้องแยกตาม `mode` — `fast-skip` เร็วกว่ารอบเต็มหลายเท่า ยุบรวมแล้วประเมินต้นทุนต่ำเกิน
 *  ② อ่านฐานไม่ได้ ⇒ `readError` + `แถว: null` **ห้ามคืน 0** (0 อ่านได้ว่า "เร็วมาก" = กลับด้าน)
 *  ③ ต้องประกาศว่ารอบที่ล้มก่อนเขียนสมุด **ไม่อยู่ในนี้**
 *  ④ ต้องมี `นาทีต่อวันประมาณ` เพราะนั่นคือเลขที่ใช้ตัดสินเรื่องเครดิต ไม่ใช่ วิ/รอบ
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

let แถวสรุป = [], แถวดิบ = [], ฐานล่ม = false;
mock.module("../../netlify/lib/coredb.mjs", { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql) => {
    if (ฐานล่ม) throw new Error("D1 ล่ม");
    if (/GROUP BY channel, mode/.test(sql)) return แถวสรุป;
    if (/SELECT channel, mode, ms/.test(sql)) return แถวดิบ;
    return [];
  },
}});
const { เวลาต่อรอบ } = await import("../../netlify/lib/stock-push-sweep.mjs");

test("① แยกตาม mode และคิดค่ากลางจากข้อมูลจริง", async () => {
  แถวสรุป = [
    { channel: "lazada", mode: "live", รอบ: 3, เร็วสุด: 10000, ช้าสุด: 14000, รวมms: 36000 },
    { channel: "lazada", mode: "fast-skip", รอบ: 4, เร็วสุด: 500, ช้าสุด: 900, รวมms: 2800 },
  ];
  แถวดิบ = [
    { channel: "lazada", mode: "live", ms: 10000 }, { channel: "lazada", mode: "live", ms: 12000 },
    { channel: "lazada", mode: "live", ms: 14000 },
    { channel: "lazada", mode: "fast-skip", ms: 500 }, { channel: "lazada", mode: "fast-skip", ms: 700 },
    { channel: "lazada", mode: "fast-skip", ms: 700 }, { channel: "lazada", mode: "fast-skip", ms: 900 },
  ];
  const r = await เวลาต่อรอบ({ ชั่วโมงย้อนหลัง: 24 });
  assert.equal(r.แถว.length, 2, "ต้องไม่ยุบ mode เข้าด้วยกัน");
  const live = r.แถว.find((x) => x.mode === "live");
  assert.equal(live.msค่ากลาง, 12000, "ค่ากลางของ 10000/12000/14000 = 12000");
  assert.equal(live.วินาทีต่อรอบเฉลี่ย, 12);
  /* ④ เลขที่ใช้ตัดสินเครดิต */
  assert.ok(typeof live.นาทีต่อวันประมาณ === "number", "ต้องมี นาทีต่อวันประมาณ");
  assert.ok(typeof r.รวมนาทีต่อวันประมาณ === "number");
});

test("① fast-skip ต้องเร็วกว่ารอบเต็มอย่างเห็นได้ชัด — ถ้าไม่ใช่ โหมดข้ามเร็วไม่ได้ช่วยอะไร", async () => {
  const r = await เวลาต่อรอบ({});
  const live = r.แถว.find((x) => x.mode === "live");
  const fast = r.แถว.find((x) => x.mode === "fast-skip");
  /* ⚠️ ด่านนี้ตรวจ **ตรรกะการแยกกอง** ด้วยข้อมูลจำลอง ไม่ได้ตรวจของจริง
     ตัวที่ตอบว่าโหมดข้ามเร็วคุ้มจริงไหม คือการยิงเส้นนี้บน production */
  assert.ok(fast.msค่ากลาง < live.msค่ากลาง, "ค่ากลางของสองกองต้องแยกกันได้");
});

test("② อ่านฐานไม่ได้ ⇒ readError + แถว null ห้ามคืน 0", async () => {
  ฐานล่ม = true;
  const r = await เวลาต่อรอบ({});
  ฐานล่ม = false;
  assert.ok(r.readError, "ต้องบอกว่าอ่านไม่ได้");
  assert.equal(r.แถว, null, "ห้ามคืนอาเรย์ว่างหรือ 0 — 0 อ่านได้ว่า 'เร็วมาก' ซึ่งกลับด้านกับความจริง");
});

test("③ ต้องประกาศว่ารอบที่ล้มก่อนเขียนสมุดไม่อยู่ในนี้", async () => {
  const r = await เวลาต่อรอบ({});
  const ขอบเขต = Object.entries(r).filter(([k]) => k.includes("ขอบเขต")).map(([, v]) => String(v)).join(" ");
  assert.match(ขอบเขต, /ล้มก่อนเขียนสมุด|ไม่อยู่ในนี้/, "ต้องบอกว่ารอบที่ล้มไม่ถูกนับ");
  assert.match(ขอบเขต, /mode/, "ต้องเตือนว่าห้ามยุบ mode");
});

test("ชั่วโมงย้อนหลังต้องถูกบีบให้อยู่ในช่วงที่ตั้งใจ", async () => {
  assert.equal((await เวลาต่อรอบ({ ชั่วโมงย้อนหลัง: 0 })).ชั่วโมงย้อนหลัง, 1, "0 ⇒ อย่างน้อย 1");
  assert.equal((await เวลาต่อรอบ({ ชั่วโมงย้อนหลัง: 99999 })).ชั่วโมงย้อนหลัง, 336, "เกินเพดาน ⇒ 14 วัน");
  assert.equal((await เวลาต่อรอบ({ ชั่วโมงย้อนหลัง: "abc" })).ชั่วโมงย้อนหลัง, 24, "อ่านไม่ออก ⇒ ค่าตั้งต้น");
});
