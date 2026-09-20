/* 🏷️ ด่าน: **"เราเลือกไม่ส่ง" ต้องไม่ถูกนับเป็น "ข้อผิดพลาด"**
 *
 * 🔴 ที่มา 20 ก.ย. 2569 — ฝั่งจอกางของจริง `?pushstuck=1&limit=200`
 *    ⇒ **109 จาก 200 แถวที่มี `last_error` คือข้อความของด่าน ⑧** (รหัสอยู่ในใบค้างส่ง)
 *    ซึ่งเป็น **การปฏิเสธโดยนโยบายของเราเอง ไม่ใช่ความล้มเหลวของแพลตฟอร์ม**
 *    ⇒ ตัวนับ `มีข้อผิดพลาด 113` อ่านตรง ๆ ไม่ได้ · ถ้าไม่กางทีละแถวจะรายงานว่า "ดันสต็อกพัง 113 รหัส"
 *
 * 🔑 ต้นเหตุตรงกับคำเตือนที่ `stock-push-live.mjs` เขียนไว้เองเมื่อ 18 ก.ย.:
 *    *"เพิ่มเหตุ not_sent ใหม่เมื่อไหร่ ต้องใส่ `notSentKind` ด้วยทุกครั้ง
 *      ไม่ใส่ = ปลายทางจัดลงกองผิด แล้วไม่มีอะไรฟ้อง"*
 *    ⇒ `stock-push-common.mjs` **ไม่เคยใส่สักจุด (4 จุด)** ⇒ คำเตือนนั้นเป็นจริงไปแล้ว
 *    ⇒ ⇒ **คำเตือนที่ไม่มีด่านบังคับ คือคำเตือนที่รอวันเป็นจริง** [[rules-need-a-gate-not-a-reminder]]
 *
 * 🚫 ด่านนี้ตรวจ **ฝั่งชนิด** ไม่ใช่ฝั่งข้อความ — ห้ามเขียนเทสที่ยืนยันว่า
 *    "ข้อความมีคำว่าใบค้างส่ง" แล้วถือว่าครบ เพราะนั่นคือการให้คำอธิบายมีอำนาจตัดสินใจ
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ด่านบนชั้น } from "../../netlify/lib/stock-push-guards.mjs";

const ค้างส่ง = new Set(["HOT"]);

test("ด่าน ⑧/⑥ ต้องคืนชนิด policy_hold · ทิศลงคืน policy_down · อ่านไม่ได้คืน needs_human", () => {
  assert.equal(ด่านบนชั้น({ sku: "HOT", kind: "up", from: 1, to: 2 }, { ค้างส่ง }).ชนิด, "policy_hold", "ด่าน ⑧");
  assert.equal(
    ด่านบนชั้น({ sku: "R", kind: "reopen", from: 0, to: 5 }, { ค้างส่ง }).ชนิด, "policy_hold", "ด่าน ⑥",
  );
  assert.equal(ด่านบนชั้น({ sku: "D", kind: "down", from: 5, to: 3 }, { ค้างส่ง }).ชนิด, "policy_down", "ทิศลง");
  /* 🔑 อ่านรายการใบค้างส่งไม่ได้ ⇒ **ต้องมีคนดู** ไม่ใช่นโยบาย
     ระบบต้องพังไปทาง "มีคนมาดู" ไม่ใช่ทาง "เงียบ" */
  assert.equal(ด่านบนชั้น({ sku: "U", kind: "up", from: 1, to: 3 }, { ค้างส่ง: null }).ชนิด, "needs_human");
  assert.equal(ด่านบนชั้น({ sku: "U", kind: "up", from: 1, to: 3 }, { ค้างส่ง }), null, "ผ่านด่าน = null");
});

test("ทุกชนิดที่ด่านคืนได้ ต้องอยู่ในตารางสัญญาของ stock-push-live.mjs", () => {
  /* 🔴 กันคลาส "เพิ่มชนิดใหม่แล้วลืมประกาศ" — ตารางนั้นคือสิ่งที่ฝั่งจออ่านเพื่อรู้ว่าต้องทำอะไรกับแต่ละชนิด
     ⇒ ชนิดที่ไม่อยู่ในตาราง = ปลายทางไม่มีทางรู้ว่าควรนับเป็น error หรือไม่ */
  const สัญญา = readFileSync("netlify/lib/stock-push-live.mjs", "utf8");
  for (const ชนิด of ["platform_error", "unknown_id", "policy_down", "stale_plan", "policy_hold", "needs_human"]) {
    assert.match(สัญญา, new RegExp("\\`" + ชนิด + "\\`"), `ชนิด ${ชนิด} ต้องมีแถวในตารางสัญญา`);
  }
});

test("ทุกจุดที่ push เข้ากอง skipped ต้องมี notSentKind — ไม่มีแม้จุดเดียวไม่ได้", () => {
  /* 📏 ตรวจที่ซอร์ส เพราะจุดที่ลืมใส่จะ **ไม่ล้ม ไม่เตือน** แค่ไปโผล่ในกอง error เงียบ ๆ
     🔑 นี่คือรูปที่ต้องตรวจด้วยด่าน ไม่ใช่ด้วยความระมัดระวัง — ของเดิมลืมครบทั้ง 4 จุด */
  const src = readFileSync("netlify/lib/stock-push-common.mjs", "utf8");
  const จุด = src.match(/skipped\.push\(\{[^}]*\}/g) ?? [];
  assert.ok(จุด.length >= 4, `ต้องเจอจุด skipped.push อย่างน้อย 4 จุด (เจอ ${จุด.length}) — ถ้าเจอน้อยกว่านี้ ตะแกรงพัง ไม่ใช่โค้ดดีขึ้น`);
  for (const [i, j] of จุด.entries()) {
    assert.match(j, /notSentKind:/, `จุดที่ ${i + 1} ไม่มี notSentKind ⇒ ปลายทางจะนับเป็น error: ${j.slice(0, 80)}`);
  }
});

test("🔬 พลังแยกแยะ: ถอด notSentKind ออกหนึ่งจุด ⇒ เทสข้างบนต้องแดง", () => {
  const src = readFileSync("netlify/lib/stock-push-common.mjs", "utf8");
  const ปลอม = src.replace('notSentKind: "stale_plan", ', "");
  assert.notEqual(ปลอม, src, "ของปลูกต้องเปลี่ยนเนื้อจริง (ไม่งั้นข้อนี้วัดอะไรไม่ได้)");
  const จุด = ปลอม.match(/skipped\.push\(\{[^}]*\}/g) ?? [];
  const ขาด = จุด.filter((j) => !/notSentKind:/.test(j));
  assert.equal(ขาด.length, 1, "ตะแกรงต้องเห็นจุดที่ขาดหนึ่งจุด ⇒ พิสูจน์ว่าข้อข้างบนไม่ใช่ประโยคที่ผ่านเสมอ");
});

test("ตัวจัดประเภทใน sweep: policy_hold ต้องอยู่ในกลุ่มนโยบาย · needs_human ต้องไม่อยู่", () => {
  /* ⚠️ `needs_human` **นับเป็น error โดยตั้งใจ** — รหัสอยู่หลายที่ · ที่อยู่ไม่ถูก · อ่านใบค้างส่งไม่ได้
     พวกนั้นไม่ใช่ความผิดของแพลตฟอร์ม แต่ต้องมีคนมาดู ⇒ ถ้าย้ายไปกองนโยบาย มันจะเงียบตลอดกาล */
  const sweep = readFileSync("netlify/lib/stock-push-sweep.mjs", "utf8");
  const บรรทัด = sweep.match(/const เป็นนโยบาย = [^;]+;/)?.[0] ?? "";
  assert.match(บรรทัด, /policy_down/);
  assert.match(บรรทัด, /policy_hold/);
  assert.match(บรรทัด, /stale_plan/);
  assert.doesNotMatch(บรรทัด, /needs_human/, "needs_human ต้องยังนับเป็น error");
  assert.doesNotMatch(บรรทัด, /platform_error/, "platform_error ต้องยังนับเป็น error");
});
