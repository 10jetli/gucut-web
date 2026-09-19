/* เทส: `skip` เป็นช่องทางการของทุกเส้น `list=`
 *
 * 🔴 19 ก.ย. 2569 ค่ำ · ฝั่งจอขอ: "`skip` ต้องอยู่ในสัญญาอย่างเป็นทางการ ไม่ใช่ช่องที่บางทีมี"
 *    เหตุผลเดียวกับ `warnkeys`: คีย์ที่มีบางที ⇒ จอแยก "ปกติ" จาก "ท่อรุ่นเก่า" ไม่ออก
 * 🔑 และการเปลี่ยนนี้จะพังของที่เช็ค **การมีคีย์** แทนค่า — กวาดเจอหนึ่งจุดแล้วแก้ไปพร้อมกัน
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ตัดคอมเมนต์ } from "../_strip-comments.mjs";

test("ท่อเติม skip: null ให้เส้น list= ที่ยังไม่มีคีย์", () => {
  const src = readFileSync("netlify/functions/core.mjs", "utf8");
  const i = src.indexOf('!("skip" in out)');
  assert.ok(i > 0, "ต้องมีตัวเติม skip");
  const บล็อก = src.slice(i - 1400, i + 200);
  assert.match(บล็อก, /ชื่อlist &&/, "ต้องเติมเฉพาะเส้น list= ไม่ยัดให้เส้นอื่น");
  assert.match(บล็อก, /ไม่ใช่ช่องที่บางทีมี/, "ต้องบันทึกเหตุผลที่ฝั่งจอขอ");
});

test("🔑 ไม่มีใครเช็ค skip ด้วยการมีคีย์อีก (ถ้ามี = ของนั้นจะอ่านคำตอบสำเร็จว่าเป็น error)", () => {
  for (const f of ["scripts/gen-returned-fields.mjs", "netlify/functions/core.mjs"]) {
    /* 🔑 **ต้องตัดคอมเมนต์ก่อนสแกน** — รอบแรกเทสนี้แดงเพราะจับคอมเมนต์ที่ผมเขียน
       เล่าเรื่องบั๊กนี้เอง (ในนั้นมีข้อความ `"skip" in r.data` เป็นตัวอย่าง)
       ⇒ คลาสเดิมที่ทีมเจอหลายรอบวันนี้: **ด่านถูกทำให้พอใจ/ไม่พอใจด้วยเอกสาร** */
    const src = ตัดคอมเมนต์(readFileSync(f, "utf8"), f);
    const บรรทัด = src.split("\n").filter((l) => /"skip" in /.test(l));
    // ยอมได้เฉพาะบรรทัดที่เป็นตัว "เติมคีย์" เอง (`!("skip" in out)`) ซึ่งถามว่าเติมแล้วหรือยัง
    const ที่ไม่ยอม = บรรทัด.filter((l) => !l.includes('!("skip" in out)'));
    assert.deepEqual(ที่ไม่ยอม, [], `${f} ยังมีการเช็ค skip ด้วยการมีคีย์: ${ที่ไม่ยอม.join(" | ")}`);
  }
});

test("ธง valueCostต่ำกว่าจริง คิดจากข้อมูล ไม่ใช่เขียนฝัง", () => {
  const src = readFileSync("netlify/lib/core-stock.mjs", "utf8");
  assert.match(src, /valueCostต่ำกว่าจริง: num\(sum\?\.no_cost\) > 0/,
    "ต้องคิดจาก noCostSkus ⇒ กรอกราคาทุนครบแล้วธงหายเอง ไม่ต้องรอคนมาถอด");
  /* 🔑 และต้องไม่พลิก valueCost เป็น null — มันคิดได้ แต่ต่ำกว่าจริง
     ส่ง null จะทำให้จอขึ้น "—" ทั้งที่มีตัวเลขที่ใช้ได้ */
  assert.match(src, /valueCost: num\(sum\?\.value_cost\)/, "valueCost ต้องยังเป็นตัวเลข");
});
