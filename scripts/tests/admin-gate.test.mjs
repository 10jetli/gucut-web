/* เทส `netlify/lib/admin-gate.mjs` — **ด่านตรวจรหัสของ API หลังร้านทุกเส้น**
 *
 * 🔴 ที่มา 19 ก.ย. 2569 ค่ำ: ฝั่งจอเสนอให้วัดด้วย `--experimental-test-coverage`
 *    ⇒ ไฟล์นี้ขึ้น **line 48.98% · funcs 0%** = ถูกโหลด แต่ **ไม่มีฟังก์ชันไหนถูกเรียกเลย**
 *    ⇒ กองเดียวกับ `lib-notify.mjs` ฝั่งเขา (ตัวที่ยิงแจ้งเตือนตอนเก็บบิลล้ม):
 *      **ของที่ทั้งระบบพึ่ง แต่ตาข่ายไม่เคยแตะ**
 *
 * 🔑 ทดสอบได้โดย **ไม่ต้อง mock Blobs** เพราะทางที่ "ไม่ส่งคีย์" และ "รหัสถูก"
 *    ไม่แตะที่เก็บข้อมูลเลยสักรอบ (แก้ไว้ 6 ก.ย. 2569 เพื่อความเร็ว)
 *    ⇒ ถ้าวันหนึ่งมีคนย้ายการอ่านตัวนับกลับมาก่อนเทียบรหัส **เทสข้อ "รหัสถูก" จะล้มทันที**
 *      ซึ่งเป็นสิ่งที่คอมเมนต์ในไฟล์นั้นห้ามไว้อยู่แล้ว — ตอนนี้มีกลไกบังคับ ไม่ใช่แค่คำเตือน
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminGate, same, lastForwardedFor, who, หัวของด่าน } from "../../netlify/lib/admin-gate.mjs";

const คำขอ = (headers = {}) => ({
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
});

test("ไม่ส่งคีย์ = ลูกค้าทั่วไป ไม่ใช่เรื่องผิด", async () => {
  const r = await adminGate(คำขอ(), {});
  assert.deepEqual(r, { wants: false, ok: false, deny: null });
});

test("ส่งคีย์แต่เซิร์ฟเวอร์ยังไม่ตั้งรหัส ⇒ 401 พร้อมหัวของด่าน", async () => {
  const เดิม = process.env.CHAT_ADMIN_KEY;
  delete process.env.CHAT_ADMIN_KEY;
  try {
    const r = await adminGate(คำขอ({ "x-admin-key": "อะไรก็ได้" }), {});
    assert.equal(r.wants, true);
    assert.equal(r.ok, false);
    assert.equal(r.deny.status, 401);
    /* 🔑 หัวต้องติดไปกับ 401 ด้วย — เคยไม่ติด เพราะ 401 ตัวนี้ถูกสร้างจากคนละที่กับคำตอบปกติ
       ⇒ จอแยก "ท่อรุ่นเก่า" ออกจาก "เส้นหาย" ไม่ได้ (แก้ไว้เมื่อเช้าวันเดียวกัน) */
    assert.ok(r.deny.headers.get("x-gucut-gate"), "401 ต้องมีหัว x-gucut-gate");
  } finally {
    if (เดิม) process.env.CHAT_ADMIN_KEY = เดิม;
  }
});

test("🔑 รหัสถูก ⇒ ผ่าน และ **ไม่แตะที่เก็บข้อมูลเลย**", async () => {
  const เดิม = process.env.CHAT_ADMIN_KEY;
  process.env.CHAT_ADMIN_KEY = "รหัสทดสอบZZ123";
  try {
    const r = await adminGate(คำขอ({ "x-admin-key": "รหัสทดสอบZZ123" }), {});
    assert.deepEqual(r, { wants: true, ok: true, deny: null });
    // ⬆️ ถ้าใครย้ายการอ่าน Blobs กลับมาก่อนเทียบรหัส ข้อนี้จะล้ม (ไม่มี Netlify context ในเทส)
  } finally {
    if (เดิม) process.env.CHAT_ADMIN_KEY = เดิม; else delete process.env.CHAT_ADMIN_KEY;
  }
});

test("เทียบรหัส: ความยาวต่างกันต้องคืน false และห้าม throw", () => {
  assert.equal(same("สั้น", "ยาวกว่ามากกกก"), false);
  assert.equal(same("เท่ากันเป๊ะ", "เท่ากันเป๊ะ"), true);
  assert.equal(same("", ""), true);
  assert.equal(same("a", "b"), false);
});

test("🔑 x-forwarded-for ต้องอ่าน **ตัวท้าย** — ถ้าอ่านตัวหน้า ตัวกันเดารหัสเท่ากับไม่มี", () => {
  /* ลูกค้าส่งหัวนี้มาเองได้ ⇒ ตัวหน้าคือค่าที่ลูกค้าพิมพ์เอง เปลี่ยนได้ทุกครั้งที่ยิง
     ⇒ ตัวนับที่ผูกกับตัวหน้า = ยิงเดาได้ไม่จำกัด (ฝั่งจอทักมา 6 ก.ย. 2569) */
  assert.equal(lastForwardedFor(คำขอ({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" })), "3.3.3.3");
  assert.equal(lastForwardedFor(คำขอ({ "x-forwarded-for": "9.9.9.9" })), "9.9.9.9");
  assert.equal(lastForwardedFor(คำขอ()), "", "ไม่มีหัว ⇒ ค่าว่าง ไม่ใช่ throw");
  assert.equal(lastForwardedFor(คำขอ({ "x-forwarded-for": " , , " })), "", "มีแต่คอมมา ⇒ ว่าง");
});

test("who(): context.ip มาก่อนทุกอย่าง แล้วค่อยหัวของ Netlify แล้วค่อย forwarded-for", () => {
  const req = คำขอ({ "x-nf-client-connection-ip": "5.5.5.5", "x-forwarded-for": "1.1.1.1, 7.7.7.7" });
  assert.equal(who(req, { ip: "8.8.8.8" }), "8.8.8.8");
  assert.equal(who(req, {}), "5.5.5.5");
  assert.equal(who(คำขอ({ "x-forwarded-for": "1.1.1.1, 7.7.7.7" }), {}), "7.7.7.7");
  assert.equal(who(คำขอ(), {}), "unknown", "ไม่รู้จริง ⇒ 'unknown' ไม่ใช่ค่าว่าง");
});

test("หัวของด่าน: แหล่งเดียวของ x-gucut-gate + x-core-build", () => {
  const h = หัวของด่าน();
  assert.ok("x-gucut-gate" in h, "ต้องมี x-gucut-gate");
  /* 🔑 x-core-build อาจไม่มีค่าในเครื่อง dev — แต่ **ถ้ามีคีย์ต้องไม่ใช่ค่าว่าง**
     (คีย์ว่างจะทำให้ปลายทางเชื่อว่าอ่านได้: ไม่มีคีย์ = ท่อรุ่นเก่า · คีย์ว่าง = อ่านไม่ได้) */
  if ("x-core-build" in h) assert.notEqual(h["x-core-build"], "");
});
