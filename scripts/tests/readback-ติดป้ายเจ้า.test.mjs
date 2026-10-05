/* ป้ายขอบเขตต้องติดไปกับคำตอบ **ทุกทางออก** — รัน: node scripts/tests/readback-ติดป้ายเจ้า.test.mjs
 *
 * 🔴 บั๊กที่ไฟล์นี้เกิดมาเฝ้า (CEO เหยียบเอง 5 ต.ค. 2569):
 *    `lazadaReadBack` ตรวจ **Lazada เจ้าเดียว** แต่ payload ที่ออกไป
 *    (`landed` · `notLanded` · `checkedAgainst`) **ไม่มีช่องไหนบอกเจ้า**
 *    ⇒ ผมอ่านคำตอบของเส้นนี้แล้วเอาไปสรุปเรื่องแผนรวมของของทะเบียน
 *      แล้ว**ส่งข้อสรุปผิดให้อีกฝั่ง** ภายในครึ่งชั่วโมง (ต้องส่งคำแก้ตาม)
 *    🔑 ชื่อฟังก์ชันไม่ใช่ป้าย — คนอ่าน payload ไม่เห็นชื่อฟังก์ชัน
 *       (กฎ scope-label-before-number · numbers-need-scope)
 *
 * 🔑 เฝ้า **ทางออกทั้งสามรูป** ไม่ใช่รูปที่ใช้บ่อย — ทางที่ผิดพลาดที่สุดคือทางที่คนดูน้อยสุด
 *    และ **ด่านที่ไม่เคยเห็นมันแดง ไม่ใช่ด่าน** ⇒ ข้อ ④ ปลูกของเสียเข้าไปวัดคมของตัวเอง
 */
import { lazadaReadBack } from "../../netlify/lib/stock-push-live.mjs";
import { planFrom } from "../../netlify/lib/stock-push.mjs";

const รู้จักทุกรหัส = async (skus) => new Set(skus.map(String));
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) console.log(`  ✅ ${name}`);
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};
const row = (sku, platformQty, coreQty, known = true) => ({ sku, name: `ของ ${sku}`, platformQty, coreQty, known });

/** ป้ายที่ถูกต้องคือค่าเดียวเท่านั้น — เทียบกับค่าตรง ไม่ใช่ truthy
 *  (truthy จะเขียวให้ค่าว่าง/true/ชื่อเจ้าผิด ⇒ ด่านไม่มีคม) */
const ป้ายถูก = (r) => r?.เจ้าที่ตรวจ === "lazada";

console.log("① ทางออกปกติ (ตัดสินได้) ต้องติดป้าย");
{
  const rows = [row("A", 1, 9), row("B", 5, 5)];
  const r = await lazadaReadBack(["A"], { skusInWarehouse: รู้จักทุกรหัส, dryRun: async () => ({ lazada: planFrom(rows, true) }) });
  ok("ตัดสินได้จริง (ไม่ใช่ inconclusive)", r.notLanded?.length === 1 && !r.inconclusive, JSON.stringify(r).slice(0, 140));
  ok("ติดป้าย เจ้าที่ตรวจ = lazada", ป้ายถูก(r), JSON.stringify(r).slice(0, 140));
  ok("note บอกขอบเขตว่าเจ้าเดียว", typeof r.note === "string" && r.note.includes("เจ้าเดียว"), String(r.note).slice(0, 120));
}

console.log("② ทางออก unknownAll (ตรวจไม่ได้ทั้งกระดาน) ต้องติดป้าย");
{
  /* ท่อไม่ส่งรายการเต็ม ⇒ no_full_plan ⇒ ไหลเข้า unknownAll */
  const rows = [row("A", 1, 9)];
  const r = await lazadaReadBack(["A"], { skusInWarehouse: รู้จักทุกรหัส, dryRun: async () => ({ lazada: planFrom(rows, false) }) });
  ok("เข้าทาง unknownAll จริง", r.inconclusive === true && r.unknown?.[0]?.reason === "no_full_plan", JSON.stringify(r).slice(0, 140));
  ok("ติดป้าย เจ้าที่ตรวจ = lazada", ป้ายถูก(r), JSON.stringify(r).slice(0, 140));
}

console.log("③ ทางออก error (แผนสดไม่มี/ร้านยังไม่เชื่อม) ต้องติดป้าย");
{
  const r = await lazadaReadBack(["A"], { skusInWarehouse: รู้จักทุกรหัส, dryRun: async () => ({ lazada: { skip: "ยังไม่ได้เชื่อมร้าน" } }) });
  ok("เข้าทาง error จริง", typeof r.error === "string", JSON.stringify(r).slice(0, 140));
  ok("ติดป้าย เจ้าที่ตรวจ = lazada", ป้ายถูก(r), JSON.stringify(r).slice(0, 140));
}

console.log("④ ปลูกของเสีย — ด่านต้องแดง (ไม่งั้นสามข้อข้างบนเป็นเขียวลวง)");
{
  /* ปลูกคำตอบที่ "ไม่มีป้าย" และ "ป้ายผิดเจ้า" แล้วตัวตัดสินเดียวกันต้องปฏิเสธทั้งคู่ */
  ok("คำตอบไร้ป้าย ⇒ ตัวตัดสินต้องว่าไม่ผ่าน", ป้ายถูก({ landed: ["A"] }) === false);
  ok("ป้ายผิดเจ้า (shopee) ⇒ ต้องว่าไม่ผ่าน", ป้ายถูก({ เจ้าที่ตรวจ: "shopee" }) === false);
  ok("ป้ายเป็น true เปล่า ⇒ ต้องว่าไม่ผ่าน", ป้ายถูก({ เจ้าที่ตรวจ: true }) === false);
  ok("ป้ายว่าง ⇒ ต้องว่าไม่ผ่าน", ป้ายถูก({ เจ้าที่ตรวจ: "" }) === false);
}

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : "\n✅ ผ่านทุกข้อ");
process.exit(fail ? 1 : 0);
