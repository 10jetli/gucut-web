/* ทดสอบ: `?zortfields=` ต้องติด **ป้ายขอบเขตรายช่อง** ห้ามใช้ป้ายรวมใบเดียว
 *
 * 🔴 ที่มา (16 ต.ค. 2569 · ใบ t_mva0li5s "เหมือน ZORT 100%") — ผมเกือบสรุปผิดเอง:
 *    `note` เดิมเขียนว่า "เฉพาะใบที่ยังไม่ success/void ย้อน N วัน" ซึ่งเป็นความจริงของ
 *    **แค่สามช่อง** ที่คิดจาก `rows` · อีกสามช่องคิดจาก `list` = ทุกใบที่สแกน
 *    ⇒ ใครเชื่อป้ายแล้วไปวัด `successDate` จะได้ 0 แล้วสรุปว่า "ZORT ไม่ส่งช่องนี้"
 *       ทั้งที่ประชากรตามป้าย **ตัดใบ success ออกไปแล้วตั้งแต่ต้น** (ป้ายพาไปผิดทาง)
 *
 * 🔑 กฎที่เทสนี้ตรึง: **ป้ายขอบเขตต้องอยู่ติดเลขของมันเอง** ไม่ใช่ป้ายเดียวพูดแทนทั้งคำตอบ
 *    (`scope-label-before-number` · `numbers-need-scope`)
 * ⚠️ เทสนี้อ่านซอร์สเป็นข้อความ ⇒ มันพิสูจน์ได้แค่ว่า "เขียนไว้" ไม่ใช่ "ส่งออกจริง"
 *    ของจริงยืนยันด้วยการยิงหลัง deploy (ผลแนบในใบงาน) — จงใจ ไม่ใช่ความบกพร่องของเทส
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ซอร์ส = readFileSync("netlify/functions/core.mjs", "utf8");
const เส้น = ซอร์ส.indexOf('if (url.searchParams.get("zortfields"))');
const จบ = ซอร์ส.indexOf('if (url.searchParams.get("channelcompare"))', เส้น);
const บล็อก = ซอร์ส.slice(เส้น, จบ > 0 ? จบ : เส้น + 12000);

test("zortfields: ต้องมีป้ายขอบเขตรายช่อง ครอบทุกช่องที่คืนตัวเลข", () => {
  assert.ok(เส้น > 0 && บล็อก.length > 500, "หาบล็อก zortfields ไม่เจอ — เทสนี้ชี้ผิดที่แล้ว");
  assert.ok(บล็อก.includes('"ขอบเขตรายช่อง"'), "ไม่มีป้าย 'ขอบเขตรายช่อง' ในคำตอบ");

  /* ทุกช่องที่คนเอาไปอ่านเป็นตัวเลข/รายชื่อ ต้องมีป้ายของตัวเอง
     ⇒ เพิ่มช่องใหม่แล้วลืมติดป้าย = เทสแดง (นั่นคือหน้าที่ของเทสนี้) */
  for (const ช่อง of ["guess", "pendingRows", "statusFields", "allFieldNames", "headerFieldsFilled", "itemFieldsFilled"]) {
    const ป้าย = new RegExp(`ขอบเขตรายช่อง[\\s\\S]*?\\b${ช่อง}\\b\\s*:`);
    assert.ok(ป้าย.test(บล็อก), `ช่อง ${ช่อง} ไม่มีป้ายขอบเขตของตัวเอง`);
  }
});

test("zortfields: ห้ามกลับไปใช้ป้ายรวมที่พูดแทนทั้งคำตอบ", () => {
  /* ป้ายเดิมอ้าง "เฉพาะใบที่ยังไม่ success/void" ใน `note` ⇒ ครอบเกินจริง
     ยอมให้คำนี้อยู่ใน `ขอบเขตรายช่อง` ได้ (ที่นั่นมันจริง) แต่ห้ามอยู่ใน note */
  const noteบรรทัด = บล็อก.match(/note: `[^`]*`/);
  assert.ok(noteบรรทัด, "หาบรรทัด note ไม่เจอ");
  assert.ok(
    !/เฉพาะใบที่ยังไม่ success\/void/.test(noteบรรทัด[0]),
    "note กลับไปอ้างประชากรของแค่สามช่องว่าเป็นของทั้งคำตอบแล้ว"
  );
});

test("zortfields: รายชื่อช่องที่ probe ต้องเป็นรายชื่อตรงตัว และต้องมีช่องวันของ ZORT", () => {
  const probe = บล็อก.match(/const HEADER_PROBE = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(probe, "หา HEADER_PROBE ไม่เจอ");
  /* 🔑 ห้ามเปลี่ยนไปใช้ regex จับชื่อช่อง — เคยทำชื่อ/ที่อยู่/เบอร์ลูกค้าหลุดออก API (4 ก.ย. 2569) */
  assert.ok(!/test\(|RegExp|match\(/.test(probe[1]), "HEADER_PROBE ต้องเป็นรายชื่อตรงตัว ห้ามใช้ regex");
  for (const ช่อง of ["createdatetime", "successDate"]) {
    assert.ok(probe[1].includes(`"${ช่อง}"`), `ยังไม่ probe ช่อง ${ช่อง} — ตอบไม่ได้ว่าทำ datetype แบบ ZORT ได้ไหม`);
  }
});
