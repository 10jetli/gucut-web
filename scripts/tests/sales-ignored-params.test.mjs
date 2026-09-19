/* ด่าน: list=sales ต้องประกาศตัวที่เมิน — พิสูจน์แบบไม่ต้องยิงของจริง
   🔑 ตรรกะที่ตรวจคือ "คิดจากคำขอจริง" ⇒ พารามิเตอร์ชื่อใหม่ต้องถูกฟ้องเองโดยไม่มีใครเติมรายชื่อ */
import { test } from "node:test";
import assert from "node:assert/strict";
const ทำ = (qs, applied) => {
  const url = new URL(`https://x/api/core?${qs}`);
  const พิจารณา = new Set(Object.keys(applied ?? {}));
  const ไม่นับ = new Set(["list"]);
  const เมิน = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (ไม่นับ.has(k) || พิจารณา.has(k)) continue;
    เมิน[k] = String(v).slice(0, 60);
  }
  return เมิน;
};
test("ตัวที่ท่อพิจารณา ไม่เข้า ignored · ตัวที่ไม่พิจารณา เข้าทันที", () => {
  const a = { day: "2026-09-19", limit: 50 };
  assert.deepEqual(ทำ("list=sales&day=2026-09-19&limit=50", a), {});
  assert.deepEqual(ทำ("list=sales&day=2026-09-19&channel=POS&q=ก&status=Done", a),
    { channel: "POS", q: "ก", status: "Done" });
  // 🔑 ปุ่มใหม่ที่จอคิดขึ้นเองต้องถูกฟ้องเอง ไม่ต้องมีใครมาเติมรายชื่อ
  assert.deepEqual(ทำ("list=sales&ปุ่มใหม่ที่ยังไม่มีใครรู้=1", a), { "ปุ่มใหม่ที่ยังไม่มีใครรู้": "1" });
});
