/* เทส `netlify/lib/token-health.mjs` — ตัวบอกว่า token มาร์เก็ตเพลสยังใช้ได้ไหม
 *
 * 🔴 ที่มา 22 ต.ค. 2569: Lazada หลุดการเชื่อมต่อมา **16 วัน** (access หมด 5 ต.ค. ·
 *    refresh_token หมดด้วย · hoursLeft -391) และ **หน้าสถานะไม่มีช่องไหนพูดถึง Lazada เลย**
 *    ⇒ หน้าที่มีไว้บอกว่าอะไรพังอยู่ ขึ้นเขียวตลอด 16 วัน
 *
 * 🔑 เทสนี้ปลูกค่าเข้าไปทุกกรณีแล้ววัดว่ามันแยกแยะได้จริง **รวมตัวควบคุมลบ**
 *    (ของดีต้องไม่แดง) เพราะด่านที่ไม่เคยเห็นว่าแดงได้ ไม่ใช่ด่าน
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ประเมินToken, รวมผลToken, หมดอายุเป็นมิลลิ } from "../../netlify/lib/token-health.mjs";

const ตอนนี้ = Date.UTC(2026, 9, 22, 4, 0, 0); // 22 ต.ค. 2569 11:00 ไทย
const ชม = 3600e3;

test("หน่วยเวลา: lazada เป็นมิลลิ · shopee/tiktok เป็นวินาที — ต้องได้มิลลิเท่ากัน", () => {
  assert.equal(หมดอายุเป็นมิลลิ({ expiresAt: ตอนนี้ + 5 * ชม }), ตอนนี้ + 5 * ชม);
  assert.equal(หมดอายุเป็นมิลลิ({ expireAt: Math.floor((ตอนนี้ + 5 * ชม) / 1000) }),
    Math.floor((ตอนนี้ + 5 * ชม) / 1000) * 1000);
  assert.equal(หมดอายุเป็นมิลลิ({}), 0, "ไม่มีข้อมูลเวลา = 0 ไม่ใช่ NaN");
});

test("🔴 ปลูกของจริง: lazada หมดอายุ -391 ชม. + ต่ออายุล้ม ⇒ down", () => {
  const r = ประเมินToken("lazada", {
    accessToken: "x",
    expiresAt: Date.UTC(2026, 9, 5, 21, 45, 18),
    refreshError: "IllegalRefreshToken: The specified refresh token is invalid or expired",
  }, ตอนนี้);
  assert.equal(r.state, "down");
  assert.match(r.why, /IllegalRefreshToken/);
  assert.ok(r.hoursLeft < -300, `hoursLeft ต้องติดลบมาก ได้ ${r.hoursLeft}`);
});

test("หมดอายุแล้วแต่ยังไม่มี refreshError ⇒ down (ห้ามเขียว)", () => {
  const r = ประเมินToken("shopee", { accessToken: "x", expireAt: (ตอนนี้ - 2 * ชม) / 1000 }, ตอนนี้);
  assert.equal(r.state, "down");
});

test("เหลือ < 24 ชม. ⇒ warn (ของยังใช้ได้ แต่ไม่ปกติ)", () => {
  const r = ประเมินToken("shopee", { accessToken: "x", expireAt: (ตอนนี้ + 3 * ชม) / 1000 }, ตอนนี้);
  assert.equal(r.state, "warn");
  assert.equal(r.hoursLeft, 3);
});

test("มีระเบียนแต่ไม่มีเวลาหมดอายุ ⇒ unknown ไม่ใช่ down ('ไม่รู้' ≠ 'เสีย')", () => {
  const r = ประเมินToken("tiktok", { accessToken: "x" }, ตอนนี้);
  assert.equal(r.state, "unknown");
  assert.equal(r.hoursLeft, null);
});

test("ไม่มีระเบียน / ไม่มี accessToken ⇒ off (ยังไม่เปิดใช้ ไม่ใช่ของเสีย)", () => {
  assert.equal(ประเมินToken("tiktok", null, ตอนนี้).state, "off");
  assert.equal(ประเมินToken("tiktok", { expiresAt: ตอนนี้ + 99 * ชม }, ตอนนี้).state, "off");
});

test("✅ ตัวควบคุมลบ: ทั้งสามเจ้าเหลือเยอะ ⇒ ok (ด่านห้ามแดงลวง)", () => {
  const ผล = [
    ประเมินToken("shopee", { accessToken: "x", expireAt: (ตอนนี้ + 48 * ชม) / 1000 }, ตอนนี้),
    ประเมินToken("lazada", { accessToken: "x", expiresAt: ตอนนี้ + 120 * ชม }, ตอนนี้),
    ประเมินToken("tiktok", { accessToken: "x", expireAt: (ตอนนี้ + 66 * ชม) / 1000 }, ตอนนี้),
  ];
  assert.deepEqual(ผล.map((x) => x.state), ["ok", "ok", "ok"]);
  assert.equal(รวมผลToken(ผล).state, "ok");
});

test("รวมผล: เจ้าเดียวแดง ⇒ ทั้งช่องแดง และข้อความต้องบอกชื่อเจ้านั้น", () => {
  const ผล = [
    ประเมินToken("shopee", { accessToken: "x", expireAt: (ตอนนี้ + 48 * ชม) / 1000 }, ตอนนี้),
    ประเมินToken("lazada", { accessToken: "x", expiresAt: ตอนนี้ - 391 * ชม }, ตอนนี้),
  ];
  const รวม = รวมผลToken(ผล);
  assert.equal(รวม.state, "down");
  assert.match(รวม.note, /lazada/);
  assert.doesNotMatch(รวม.note, /shopee/, "ข้อความต้องชี้เฉพาะตัวที่เสีย ไม่ปนตัวที่ดี");
});

test("🔑 เจ้าที่ยังไม่เชื่อม ไม่ถ่วงผลรวมให้แดง (ร้านที่ใช้เจ้าเดียวต้องไม่แดงตลอดกาล)", () => {
  const ผล = [
    ประเมินToken("shopee", { accessToken: "x", expireAt: (ตอนนี้ + 48 * ชม) / 1000 }, ตอนนี้),
    ประเมินToken("lazada", null, ตอนนี้),
    ประเมินToken("tiktok", null, ตอนนี้),
  ];
  assert.equal(รวมผลToken(ผล).state, "ok");
});

test("ไม่ได้เชื่อมเลยทุกเจ้า ⇒ off (ยังไม่เปิดใช้ ไม่ใช่พัง)", () => {
  assert.equal(รวมผลToken([ประเมินToken("shopee", null, ตอนนี้), ประเมินToken("lazada", null, ตอนนี้)]).state, "off");
});
