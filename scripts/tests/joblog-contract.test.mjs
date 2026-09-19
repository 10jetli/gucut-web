/* ด่าน: ช่องรับสมุดเวลาจากงานฝั่งจอ (`POST ?joblog=1`) — ตรวจกติกาโดยไม่ยิงของจริง
 * 🔑 ตรวจ **ตรรกะการตัดสิน** ที่เส้นนี้ใช้ ไม่ใช่ตรวจว่ามีโค้ดอยู่
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ผลที่ยอมรับ, แถวที่จะจด } from "../../netlify/lib/job-timing.mjs";

const ต้องขึ้นต้นจอ = (ชื่อ) => /^จอ\//.test(String(ชื่อ ?? "").trim());

test("ชื่องานต้องขึ้นต้น จอ/ — กันชนกับงานฝั่งท่อ", () => {
  assert.equal(ต้องขึ้นต้นจอ("จอ/bills-netlify"), true);
  assert.equal(ต้องขึ้นต้นจอ("core-sync"), false, "ชื่อฝั่งท่อต้องถูกปฏิเสธ ไม่งั้นสมุดปนกันแล้วแยกที่มาไม่ได้");
  assert.equal(ต้องขึ้นต้นจอ(""), false);
});

test("ผลที่ฝั่งจอส่งมา ถ้าไม่อยู่ในสามค่า ⇒ จดเป็น 'ไม่ได้ตัดสิน' ห้ามกลายเป็น ok", () => {
  assert.equal(แถวที่จะจด({ งาน: "จอ/x", ms: 1, ผล: "สำเร็จ" })[3], "ไม่ได้ตัดสิน");
  assert.equal(แถวที่จะจด({ งาน: "จอ/x", ms: 1, ผล: undefined })[3], "ไม่ได้ตัดสิน");
  assert.equal(แถวที่จะจด({ งาน: "จอ/x", ms: 1, ผล: "ok" })[3], "ok");
  assert.deepEqual(ผลที่ยอมรับ, ["ok", "failed", "ไม่ได้ตัดสิน"]);
});

test("ms ต้องเป็นเลข ≥ 0 (กันสมุดมีค่าที่แปลไม่ได้)", () => {
  const ใช้ได้ = (v) => Number.isFinite(Number(v)) && Number(v) >= 0;
  assert.equal(ใช้ได้("120"), true);
  assert.equal(ใช้ได้(-1), false);
  assert.equal(ใช้ได้("ช้า"), false);
  assert.equal(ใช้ได้(undefined), false);
});
