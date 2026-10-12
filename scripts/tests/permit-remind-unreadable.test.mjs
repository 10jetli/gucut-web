// รัน: node --experimental-test-module-mocks --test scripts/tests/permit-remind-unreadable.test.mjs
/* 🔴 ด่าน B24 ภาคสอง: ตามเตือนทะเบียน — "อ่านไม่ได้" ห้ามกลายเป็น "ไม่ต้องเตือน"
 *    ใบ t_mv4w390r · 12 ต.ค. 2569
 *
 * การ์ดชี้ `permit-doc.mjs:257` · `permit-remind.mjs:97` · `status.mjs:220`
 * **ทั้งสามจุดแก้ไปแล้ว 4 ต.ค.** — ยืนยันด้วยการอ่านโค้ดจริง ไม่ได้เชื่อการ์ด
 * แต่รอบนั้นแก้ **ขาอ่านรายชื่อ** (`list()` ล้ม ⇒ โยน) ส่วน **ขาอ่านรายแถว** ยังกลืนเหมือนเดิม:
 *     const rec = await s.get(key).catch(() => null);  if (!rec) continue;
 * ⇒ เรื่องที่อ่านไม่ได้ถูกนับเป็น "ไม่ต้องเตือน" เงียบ ๆ
 * ⇒ และรายงานคืน `checked: blobs.length` ⇒ **นับแถวที่อ่านไม่ได้ว่าตรวจแล้ว**
 *
 * 🔑 คลาส: ไฟล์นี้ยืม `อ่านรายชื่อคีย์` จาก `blob-keys.mjs` **แต่ไม่ได้ยืมตัวนับ `unreadable`**
 *    ⇒ ใช้กติการ่วมแค่ครึ่งเดียว ⇒ ครึ่งที่ไม่ได้ยืมคือครึ่งที่พัง
 *
 * และอีกสองจุดในลูปเดียวกันที่โยนความจริงทิ้งหลังจากที่ขาผลิตบอกมาแล้ว:
 *  · `pushToUser` คืน `null` = ยังไม่รู้ว่าส่งถึงไหม (แก้ใน B11 วันเดียวกัน)
 *    ของเดิม `.catch(() => 0)` + `if (n)` ยุบ null/0/error เป็น "ไม่ถึง" ก้อนเดียว
 *  · `linePush` คืนค่าอื่นที่ไม่ใช่ sent/blocked ⇒ ของเดิมตกทิ้งเงียบ
 *    ⇒ ร้านเห็น "ไม่ถึงเลย" เหมือนกรณีลูกค้าไม่มี LINE ซึ่งคนละเรื่อง (ลองใหม่ได้ vs ต้องโทร)
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

let แถว = {};            // key → ค่า หรือ "พัง" ให้โยน
let เขียน = [];
let บอกกลุ่ม = [];
let ผลpush = 1;          // 1 = ส่งได้ · 0 = ไม่มีเครื่อง · null = ไม่รู้
let ผลline = "sent";

mock.module("@netlify/blobs", { namedExports: {
  getStore: () => ({
    list: async () => ({ blobs: Object.keys(แถว).map((key) => ({ key })) }),
    get: async (k) => {
      if (แถว[k] === "พัง") throw new Error("Blobs 500: ล่มจำลอง");
      return แถว[k] ?? null;
    },
    setJSON: async (k, v) => { เขียน.push([k, v]); },
  }),
} });
mock.module("../../netlify/lib/push.mjs", { namedExports: {
  pushToUser: async () => ผลpush,
} });
mock.module("../../netlify/lib/line-push.mjs", { namedExports: {
  linePush: async () => ผลline,
} });
mock.module("../../netlify/lib/session.mjs", { namedExports: {
  store: () => ({ get: async () => ({ social: { line: { id: "U1" } } }) }),
} });
/* ⚠️ `tell()` เป็นฟังก์ชันในไฟล์เดียวกัน **ไม่ใช่ import** ⇒ mock.module ใช้ไม่ได้
   (รอบแรกผมเดาว่ามี `telegram.mjs` แล้วได้ ERR_MODULE_NOT_FOUND ⇒ ดีที่มันดังทันที
    ถ้า mock ไปโดนโมดูลที่มีจริงแต่ผิดตัว เทสจะเขียวโดยไม่เคยแตะทางที่ตั้งใจ)
   ⇒ ดักที่ขอบเครือข่ายจริงแทน: ข้อความไป Telegram อยู่ใน body ของคำขอ */
process.env.TELEGRAM_BOT_TOKEN = "t"; process.env.TELEGRAM_CHAT_ID = "c";
globalThis.fetch = async (url, opt) => {
  if (String(url).includes("api.telegram.org")) {
    try { บอกกลุ่ม.push(JSON.parse(String(opt?.body ?? "{}")).text ?? ""); } catch { บอกกลุ่ม.push(""); }
  }
  return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => "" };
};

const { runReminders } = await import("../../netlify/lib/permit-remind.mjs");

const นาน = (วัน) => new Date(Date.now() - วัน * 864e5).toISOString();
const เรื่อง = (phone, x = {}) => ({
  phone, name: `ลูกค้า ${phone}`, stage: "lz2",
  history: { lz2: นาน(30) }, updatedAt: นาน(30), at: นาน(30), ...x,
});
const ตั้ง = () => { เขียน = []; บอกกลุ่ม = []; ผลpush = 1; ผลline = "sent"; };

test("🔑 แถวที่อ่านไม่ได้ ⇒ นับแยก และ **ห้ามนับว่าตรวจแล้ว**", async () => {
  ตั้ง();
  แถว = { "c/0810000001": เรื่อง("0810000001"), "c/0810000002": "พัง", "c/0810000003": "พัง" };
  const r = await runReminders();
  assert.equal(r.อ่านแถวไม่ได้, 2, "สองแถวอ่านไม่ได้ ⇒ ต้องโผล่ในรายงาน");
  assert.equal(r.checked, 1,
    "ต้องนับแค่แถวที่เปิดอ่านได้ — ของเดิมคืน blobs.length ⇒ รายงานว่าตรวจครบทั้งที่ไม่เคยเปิด 2 เรื่อง");
  assert.equal(r.nudged, 1, "เรื่องที่อ่านได้ยังต้องถูกเตือนตามปกติ");
});

test("🔑 พลังแยกแยะ: อ่านได้ครบ ⇒ `อ่านแถวไม่ได้` ต้องเป็น 0 **และต้องมีช่องนี้**", async () => {
  ตั้ง();
  แถว = { "c/0810000001": เรื่อง("0810000001") };
  const r = await runReminders();
  assert.equal(r.อ่านแถวไม่ได้, 0);
  assert.ok("อ่านแถวไม่ได้" in r,
    "ต้องมีช่องแม้เป็น 0 — ไม่มีช่อง ≠ ไม่มีปัญหา (จอแยก 'ท่อรุ่นเก่า' จาก 'อ่านครบ' ไม่ได้)");
  assert.equal(r.checked, 1);
});

test("🔑 `pushToUser` คืน null (ไม่รู้) ⇒ ต้องบอกว่า **ยังไม่รู้ผล** ไม่ใช่ 'ไม่ถึง'", async () => {
  /* 🔴 **รุ่นแรกของเทสข้อนี้ไม่มีพลังเลย — จับได้ตอนปลูก (12 ต.ค. 2569)**
     เดิมตั้ง `ผลline = "error"` ด้วย ⇒ ชั้น LINE ก็พิมพ์คำว่า "ยังไม่รู้ผล" ออกมา
     ⇒ ปลูกบั๊กที่ชั้น push (ยุบ null เป็น "ไม่ถึง") แล้ว **เทสยังเขียว 6/6**
       เพราะข้อความที่ค้นหาเจอ มาจาก **ชั้นอื่น** ไม่ใช่ชั้นที่กำลังทดสอบ
     🔑 ⇒ ตั้ง LINE เป็น `blocked` (= **รู้ผลแล้ว**) เพื่อให้ "ยังไม่รู้ผล" มีแหล่งเดียวคือชั้น push
        (กฎ: ยืนยันข้อความที่ผลิตได้จากหลายทาง ต้องปิดทางอื่นให้เหลือทางเดียวก่อน) */
  ตั้ง();
  ผลpush = null; ผลline = "blocked";
  แถว = { "c/0810000001": เรื่อง("0810000001") };
  const r = await runReminders();
  assert.equal(r.nudged, 1);
  const ข้อความ = บอกกลุ่ม.join("\n");
  assert.match(ข้อความ, /แจ้งเตือนมือถือ — \*\*ยังไม่รู้ผล\*\*/,
    "ต้องเป็นป้ายของ **ชั้น push** โดยเฉพาะ — ของเดิมยุบ null เป็น 'ไม่ถึง' เงียบ ๆ");
  assert.doesNotMatch(ข้อความ, /ไม่ถึงเลย/,
    "ห้ามสรุปว่าไม่ถึง เมื่อความจริงคืออ่านรายชื่อเครื่องไม่ได้");
});

test("🔑 พลังแยกแยะ: ส่งไม่ถึงจริง (0 เครื่อง · ไม่มี LINE) ⇒ **ต้องเขียนว่าไม่ถึงเลย**", async () => {
  ตั้ง();
  ผลpush = 0; ผลline = "blocked";
  แถว = { "c/0810000001": เรื่อง("0810000001") };
  await runReminders();
  const ข้อความ = บอกกลุ่ม.join("\n");
  assert.match(ข้อความ, /ยังไม่ได้เพิ่มเพื่อน/, "LINE blocked = รู้ผลแล้ว ⇒ รายงานตามจริง");
  assert.doesNotMatch(ข้อความ, /ยังไม่รู้ผล/,
    "ถ้าเคสนี้ก็เขียน 'ยังไม่รู้ผล' ด้วย แปลว่าเราติดป้ายนั้นทุกกรณี ⇒ ป้ายนั้นไร้ความหมาย");
});

test("LINE ตอบค่าที่ไม่รู้จัก ⇒ บอกว่ายิงไม่ออก (ลองใหม่ได้) ไม่ใช่เงียบ", async () => {
  ตั้ง();
  ผลpush = 0; ผลline = "error";
  แถว = { "c/0810000001": เรื่อง("0810000001") };
  await runReminders();
  assert.match(บอกกลุ่ม.join("\n"), /LINE ยิงไม่ออก/,
    "ลูกค้ามี LINE อยู่แต่เรายิงไม่ออก ⇒ คนละเรื่องกับ 'ไม่มี LINE'");
});

test("ทุกแถวอ่านไม่ได้ ⇒ checked 0 · ไม่เตือนใคร · และไม่เงียบ", async () => {
  ตั้ง();
  แถว = { "c/a": "พัง", "c/b": "พัง" };
  const r = await runReminders();
  assert.equal(r.checked, 0);
  assert.equal(r.อ่านแถวไม่ได้, 2);
  assert.equal(r.nudged, 0);
});
