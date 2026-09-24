/* เทส "รุ่นที่ขึ้นเว็บอยู่จริง" — `netlify/lib/deploy-state.mjs`
 *
 * 🔴 ที่มา 19 ก.ย. 2569 · ฝั่งจอตอบคำถาม "ของที่เห็นอยู่เป็นรุ่นใหม่จริงหรือยัง" ไม่ได้เลยสักวิธี
 * 🔑 หัวใจของเทสนี้: **ห้ามเดาว่าใบล่าสุดคือใบที่เสิร์ฟอยู่**
 *    ถ้าเดา ⇒ จะตอบผิดในวันที่ build ตก ซึ่งเป็นวันเดียวที่คนมาถามคำถามนี้จริง
 * ⚠️ ตัวปลอมในเทสนี้เห็นได้แค่มิติที่เราใส่ให้ (mock-cant-see-missing-dimension)
 *    ⇒ ยังต้องยิงของจริงหลัง deploy เพื่อยืนยัน `ฟิลด์ที่ยังไม่ยืนยัน`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
/* 🔑 **import ตรงหนึ่งบรรทัด เพื่อให้ coverage อ่านไฟล์จริงได้** (19 ก.ย. 2569 ค่ำ)
 * 🔴 เทสข้างล่างต้องโหลดโมดูลใหม่ทุกครั้ง (`?t=${Date.now()}`) เพราะมันเปลี่ยน env/ไฟล์ก่อนเรียก
 *    แต่ query ทำให้ Node เห็นเป็น **module URL อีกตัว** ⇒ `--experimental-test-coverage`
 *    นับโค้ดที่รันให้ URL ที่มี query แล้ว **ไฟล์จริงเหลือ funcs 0%**
 *    📏 พิสูจน์แล้วกับไฟล์นี้: ด้วย query ⇒ line 30.97% funcs 0% · ไม่มี query ⇒ line 93.81% funcs 100%
 *    ⇒ ใครอ่าน `funcs 0%` ว่า "ไม่มีเทส" จะสรุปผิด ⇒ บรรทัดนี้ทำให้รายงานตรงกับความจริง
 * 🚫 ห้ามลบ และห้ามเอาไปแทนการโหลดใหม่ข้างล่าง (เทสยังต้อง reload จริง) */
import { สถานะการปล่อยของ as สถานะจากไฟล์จริง, ฟิลด์ที่ยังไม่ยืนยัน as ฟิลด์จริง } from "../../netlify/lib/deploy-state.mjs";


const โหลด = async () => (await import(`../../netlify/lib/deploy-state.mjs?t=${Date.now()}`));

/** แทน fetch ชั่วคราว — คืนสิ่งที่สั่ง แล้วคืนของเดิมให้เสมอ */
async function ด้วยคำตอบปลอม(คำตอบ, ทำ) {
  const เดิม = globalThis.fetch;
  globalThis.fetch = async () => คำตอบ;
  try { return await ทำ(); } finally { globalThis.fetch = เดิม; }
}
const res = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("ไม่มี token ⇒ skip (ไม่ใช่ ok:false)", async () => {
  const { สถานะการปล่อยของ } = await โหลด();
  const เดิม = { a: process.env.NETLIFY_API_TOKEN, b: process.env.NETLIFY_AUTH_TOKEN };
  delete process.env.NETLIFY_API_TOKEN; delete process.env.NETLIFY_AUTH_TOKEN;
  try {
    const r = await สถานะการปล่อยของ("2026-09-19T00:00:00.000Z");
    assert.ok(r.skip, "ต้องมี skip");
    assert.equal("ok" in r, false, "ทำต่อไม่ได้ ⇒ ห้ามมีคีย์ ok");
    assert.equal(r.ท่อรุ่นนี้, "2026-09-19T00:00:00.000Z", "ต้องยังบอกรุ่นของท่อได้แม้ถาม Netlify ไม่ได้");
  } finally {
    if (เดิม.a) process.env.NETLIFY_API_TOKEN = เดิม.a;
    if (เดิม.b) process.env.NETLIFY_AUTH_TOKEN = เดิม.b;
  }
});

test("200 แต่รูปไม่ใช่อาร์เรย์ ⇒ inconclusive และห้ามมีคีย์ ok", async () => {
  process.env.NETLIFY_API_TOKEN = "x"; process.env.SITE_ID = "site";
  const { สถานะการปล่อยของ } = await โหลด();
  const r = await ด้วยคำตอบปลอม(res({ message: "ok" }), () => สถานะการปล่อยของ("b"));
  assert.equal(r.inconclusive, true);
  assert.equal("ok" in r, false, '"แปลผลไม่ได้" ≠ "ผลว่าไม่ผ่าน"');
  assert.match(r.error, /ไม่ใช่อาร์เรย์/);
});

test("🔑 ไม่มี state/published_at ⇒ ที่เสิร์ฟอยู่ = null พร้อมเหตุผล (ห้ามเดาใบล่าสุด)", async () => {
  process.env.NETLIFY_API_TOKEN = "x"; process.env.SITE_ID = "site";
  const { สถานะการปล่อยของ } = await โหลด();
  const r = await ด้วยคำตอบปลอม(
    res([{ id: "d1", created_at: "2026-09-19T10:00:00Z", deploy_time: 90 }]),
    () => สถานะการปล่อยของ("b")
  );
  assert.equal(r.ok, true);
  assert.equal(r.ที่เสิร์ฟอยู่, null, "ห้ามเดาว่าใบล่าสุดคือใบที่เสิร์ฟอยู่");
  assert.match(r.ทำไมไม่รู้ว่าใบไหนเสิร์ฟอยู่, /ไม่เดาจากใบล่าสุด/);
  assert.equal(r.ตกกี่ใบใน10ใบ, null, "ไม่รู้สถานะ ⇒ นับใบที่ตกไม่ได้ ต้องเป็น null ไม่ใช่ 0");
});

test("ใบล่าสุดตก แต่ใบก่อนหน้า published ⇒ ต้องเลือกใบที่ published", async () => {
  process.env.NETLIFY_API_TOKEN = "x"; process.env.SITE_ID = "site";
  const { สถานะการปล่อยของ } = await โหลด();
  const r = await ด้วยคำตอบปลอม(
    res([
      { id: "ใบที่ตก", state: "error", created_at: "2026-09-19T12:00:00Z", error_message: "build failed" },
      { id: "ใบที่เสิร์ฟ", state: "ready", published_at: "2026-09-19T09:00:00Z", created_at: "2026-09-19T08:50:00Z" },
    ]),
    () => สถานะการปล่อยของ("b")
  );
  assert.equal(r.ที่เสิร์ฟอยู่.id, "ใบที่เสิร์ฟ", "ต้องไม่หยิบใบที่ตกมาเป็นรุ่นที่เสิร์ฟอยู่");
  assert.equal(r.ล่าสุด.id, "ใบที่ตก", "แต่ต้องยังบอกได้ว่าใบล่าสุดคือใบไหน");
  assert.equal(r.ตกกี่ใบใน10ใบ, 1);
  assert.equal(r.ล่าสุด.สำเร็จไหม, false);
});

/* 🔑 ข้อนี้เรียกจาก **โมดูลที่ import ตรง** (ไม่ผ่าน `?t=`) โดยตั้งใจ — สองเหตุผล:
   ① `token()` อ่าน env **ตอนเรียก** ไม่ใช่ตอนโหลด ⇒ ไม่ต้อง reload ก็ทดสอบได้
   ② ทำให้ `--experimental-test-coverage` เห็นว่าฟังก์ชันถูกเรียกจริง
      📏 วัดแล้ว: เรียกผ่าน `?t=` เท่านั้น ⇒ ไฟล์จริงรายงาน **funcs 0%** ทั้งที่เทสผ่านครบ
         (query ทำให้ Node เห็นเป็น module URL อีกตัว) ⇒ ใครอ่าน 0% ว่า "ไม่มีเทส" จะสรุปผิด */
test("ฟิลด์ที่ยังไม่ยืนยันต้องติดไปกับคำตอบทุกเส้นทาง + เรียกจากไฟล์จริงให้ coverage เห็น", async () => {
  assert.ok(ฟิลด์จริง.includes("state"), "state ยังไม่เคยเห็นค่าจริง ⇒ ต้องอยู่ในรายชื่อ");
  const เดิม = { a: process.env.NETLIFY_API_TOKEN, b: process.env.NETLIFY_AUTH_TOKEN };
  delete process.env.NETLIFY_API_TOKEN; delete process.env.NETLIFY_AUTH_TOKEN;
  try {
    const r = await สถานะจากไฟล์จริง("x");
    assert.ok(r.skip, "ไม่มี token ⇒ ต้อง skip (เรียกผ่านโมดูลที่ import ตรง)");
    assert.equal("ok" in r, false);
  } finally {
    if (เดิม.a) process.env.NETLIFY_API_TOKEN = เดิม.a;
    if (เดิม.b) process.env.NETLIFY_AUTH_TOKEN = เดิม.b;
  }
});
