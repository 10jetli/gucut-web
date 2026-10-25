// รัน: node --experimental-test-module-mocks --test scripts/tests/permit-remind-printed.test.mjs
/* ด่าน: ตามเตือนลูกค้าที่ค้างขั้น `printed` — **ทวงครั้งเดียวต่อเรื่อง**
 * ใบสั่ง CEO 25 ต.ค. 2569 ข้อ [ค]: "ทวงครั้งเดียวต่อใบ ติดธงในบันทึก · ห้ามทวงรัว
 * (โดนบล็อก LINE = เสียช่องทางถาวร)"
 *
 * 🔴 สามอย่างที่ต้องแยกให้ขาด และเทสนี้ต้องแยกแยะได้จริง
 *  ① **ทวงครั้งเดียว ≠ ทวงไม่เลย** — เรื่องที่ค้างนานต้องได้ครั้งแรกจริง
 *  ② **ครั้งที่สองต้องไม่ออก** ไม่ว่าเวลาจะผ่านไปอีกกี่วัน (ธงรายขั้นเป็นด่าน ไม่ใช่ตัวนับ)
 *  ③ **ขั้นอื่นต้องยังทวงซ้ำได้ตามเดิม** — ถ้าแก้แล้วขั้นอื่นกลายเป็นทวงครั้งเดียวด้วย
 *     ลูกค้าที่ถือใบ ลซ.๒ อยู่ที่บ้านจะไม่มีใครตามอีกเลย (เสียกว่าปัญหาเดิม)
 *
 * 🔑 และ **เขียนธงไม่สำเร็จต้องไม่รายงานว่าทวงแล้วเฉย ๆ** — ธงไม่ลง = รอบหน้าทวงซ้ำ
 *    ซึ่งเป็นสิ่งเดียวที่ใบสั่งห้ามไว้ตรง ๆ ⇒ ต้องมีบรรทัดเตือนร้าน
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

let แถว = {};
let เขียน = [];
let บอกกลุ่ม = [];
let เขียนพัง = false;

mock.module("@netlify/blobs", { namedExports: {
  getStore: () => ({
    list: async () => ({ blobs: Object.keys(แถว).map((key) => ({ key })) }),
    get: async (k) => แถว[k] ?? null,
    setJSON: async (k, v) => {
      if (เขียนพัง) throw new Error("Blobs 500: เขียนไม่ได้ (จำลอง)");
      เขียน.push([k, JSON.parse(JSON.stringify(v))]);
      แถว[k] = JSON.parse(JSON.stringify(v));
    },
  }),
} });
mock.module("../../netlify/lib/push.mjs", { namedExports: { pushToUser: async () => 1 } });
mock.module("../../netlify/lib/line-push.mjs", { namedExports: { linePush: async () => "sent" } });
mock.module("../../netlify/lib/session.mjs", { namedExports: {
  store: () => ({ get: async () => ({ social: { line: { id: "U1" } } }) }),
} });
process.env.TELEGRAM_BOT_TOKEN = "t"; process.env.TELEGRAM_CHAT_ID = "c";
globalThis.fetch = async (url, opt) => {
  if (String(url).includes("api.telegram.org")) {
    try { บอกกลุ่ม.push(JSON.parse(String(opt?.body ?? "{}")).text ?? ""); } catch { บอกกลุ่ม.push(""); }
  }
  return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => "" };
};

const { runReminders } = await import("../../netlify/lib/permit-remind.mjs");

const นาน = (วัน) => new Date(Date.now() - วัน * 864e5).toISOString();
/** เรื่องที่ค้างขั้น printed มานาน — รูปเดียวกับของจริงบนเว็บ (อ่าน 25 ต.ค. 2569) */
const ค้างprinted = (วัน = 53, x = {}) => ({
  phone: "0611800485", name: "ลูกค้าค้างพิมพ์แบบ", stage: "printed",
  history: { printed: นาน(วัน) }, at: นาน(วัน), images: 0, ...x,
});
const ตั้ง = () => { เขียน = []; บอกกลุ่ม = []; เขียนพัง = false; };

test("① ค้างขั้น printed นาน ⇒ ต้องได้ทวงครั้งแรก และต้องติดธงรายขั้นไว้", async () => {
  ตั้ง();
  แถว = { "c/0611800485": ค้างprinted() };
  const r = await runReminders();
  assert.equal(r.nudged, 1, "ของเดิมไม่มี printed ใน NUDGE ⇒ เคยได้ 0 (เรื่องนี้ไม่เคยมีใครติดต่อ)");
  const [, บันทึก] = เขียน.at(-1);
  assert.ok(บันทึก.remindedStages?.printed, "ต้องติดธงรายขั้น — ใบสั่งสั่งว่า 'ติดธงในบันทึก'");
  assert.equal(บันทึก.remindCount, 1);
  assert.match(บอกกลุ่ม.join("\n"), /printed/, "ร้านต้องเห็นว่าเรื่องนี้ค้างขั้นไหน (รหัสดิบ)");
  assert.match(บอกกลุ่ม.join("\n"), /ทวงครั้งเดียวต่อเรื่อง/,
    "ต้องบอกร้านว่าครั้งต่อไปต้องโทรเอง ไม่งั้นร้านจะเข้าใจว่าระบบตามให้เรื่อย ๆ");
});

test("② ธงลงแล้ว ⇒ ห้ามทวงอีก แม้เวลาผ่านไปอีกนาน (ของเดิมจะทวงทุก 3 วัน)", async () => {
  ตั้ง();
  แถว = { "c/0611800485": ค้างprinted(53, {
    remindedStages: { printed: นาน(40) }, lastRemind: นาน(40), remindCount: 1,
  }) };
  const r = await runReminders();
  assert.equal(r.nudged, 0, "ธงรายขั้นต้องเป็นด่าน — ไม่ใช่ REPEAT_DAYS ที่หมดอายุไปแล้ว 40 วัน");
  assert.equal(เขียน.length, 0, "ไม่ส่ง = ไม่เขียนทับอะไร");
  assert.equal(บอกกลุ่ม.length, 0, "และต้องไม่ไปรบกวนกลุ่มร้านด้วย");
});

test("② ตัวควบคุมลบ: ธงของ *ขั้นอื่น* ต้องไม่กันขั้น printed", async () => {
  ตั้ง();
  แถว = { "c/0611800485": ค้างprinted(53, { remindedStages: { submitted: นาน(40) } }) };
  const r = await runReminders();
  assert.equal(r.nudged, 1,
    "ถ้าข้อนี้ได้ 0 แปลว่าเราเช็คว่า 'มีธงอะไรก็ได้' ⇒ ธงจะกันข้ามขั้นกันเอง");
});

test("③ ขั้นอื่นต้องทวงซ้ำได้ตามเดิม — ห้ามกลายเป็นทวงครั้งเดียวทั้งหมด", async () => {
  ตั้ง();
  // ขั้น lz2 เคยทวงไปแล้ว 2 ครั้ง ครั้งล่าสุด 10 วันก่อน ⇒ ยังอยู่ในกติกาเดิม (ซ้ำได้ทุก 3 วัน)
  แถว = { "c/0842245186": {
    phone: "0842245186", name: "ลูกค้าถือใบอยู่บ้าน", stage: "lz2",
    history: { lz2: นาน(30) }, at: นาน(40), images: 1,
    remindedStages: { lz2: นาน(10) }, lastRemind: นาน(10), remindCount: 2,
  } };
  const r = await runReminders();
  assert.equal(r.nudged, 1, "ขั้น lz2 ต้องยังทวงซ้ำได้ — ไม่งั้นใบตัวจริงจะค้างที่บ้านลูกค้าตลอดกาล");
  assert.equal(เขียน.at(-1)[1].remindCount, 3);
});

test("③ ตัวควบคุมลบ: ขั้นอื่นยังต้องเคารพงบรวมและช่วงพักเหมือนเดิม", async () => {
  ตั้ง();
  แถว = { "c/a": {
    phone: "0810000001", name: "ก", stage: "lz2", history: { lz2: นาน(30) }, at: นาน(30),
    lastRemind: นาน(1), remindCount: 2,     // พักยังไม่ครบ 3 วัน
  }, "c/b": {
    phone: "0810000002", name: "ข", stage: "lz2", history: { lz2: นาน(30) }, at: นาน(30),
    lastRemind: นาน(30), remindCount: 6,    // งบรวมหมดแล้ว
  } };
  const r = await runReminders();
  assert.equal(r.nudged, 0, "ถ้าได้ > 0 แปลว่าเราปิดด่านงบ/ช่วงพักของขั้นอื่นไปด้วย");
});

test("④ ยังไม่ถึงเวลารอ ⇒ ยังไม่ทวง (printed ก็ต้องรอเหมือนขั้นอื่น)", async () => {
  ตั้ง();
  แถว = { "c/0611800485": ค้างprinted(2) };
  const r = await runReminders();
  assert.equal(r.nudged, 0, "พิมพ์แบบเมื่อวานซืนแล้วทวงเลย = ทวงรัว (เขายังไม่มีเวลาไปสำนักงาน)");
  // ตัวควบคุมลบ: พอครบเวลารอแล้วต้องทวง
  ตั้ง();
  แถว = { "c/0611800485": ค้างprinted(8) };
  assert.equal((await runReminders()).nudged, 1, "ครบเวลารอแล้วต้องทวง ไม่ใช่เงียบตลอดกาล");
});

test("⑤ เขียนธงไม่สำเร็จ ⇒ ต้องเตือนร้าน ไม่ใช่รายงานว่าทวงแล้วเฉย ๆ", async () => {
  ตั้ง();
  แถว = { "c/0611800485": ค้างprinted() };
  เขียนพัง = true;
  await runReminders();
  const ข้อความ = บอกกลุ่ม.join("\n");
  assert.match(ข้อความ, /จดธงไม่สำเร็จ/,
    "ธงไม่ลง = รอบหน้าทวงซ้ำ ซึ่งเป็นสิ่งเดียวที่ใบสั่งห้ามตรง ๆ ⇒ ต้องมีคนรู้");
});

test("⑤ ตัวควบคุมลบ: เขียนธงสำเร็จ ⇒ **ห้ามมี** บรรทัดเตือนนั้น", async () => {
  ตั้ง();
  แถว = { "c/0611800485": ค้างprinted() };
  await runReminders();
  assert.doesNotMatch(บอกกลุ่ม.join("\n"), /จดธงไม่สำเร็จ/,
    "ถ้าขึ้นทุกรอบ แปลว่าป้ายนั้นไร้ความหมาย");
});
