/* เทส `gen-warn-keys.mjs` + เส้น `?warnkeys=1`
 *
 * 🔴 ที่มา 19 ก.ย. 2569 ค่ำ · ฝั่งจอวัดมาว่าจออ่าน "ไม่มีคีย์ = ปกติ" **38 จุด**
 *    และแยก "ท่อรุ่นเก่ายังไม่รู้จักคีย์" ออกจาก "ปกติจริง" ได้เพียง **1 จุด**
 *
 * 🔑 เทสที่สำคัญที่สุดในไฟล์นี้คือข้อ "ต้องสกัดใหม่ทุกครั้ง ไม่ใช่รายชื่อแช่" —
 *    ถ้ารายชื่อค้าง จอจะเทียบกับความจริงเก่า **แล้วยังขึ้นเขียวอย่างมั่นใจ**
 *    ซึ่งคือโรคเดิมที่ของชิ้นนี้ถูกสร้างมาแก้ (แต่คราวนี้มีทะเบียนค้ำให้ดูน่าเชื่อกว่าเดิม)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
/* 🔴 **เคยมี `import "…/warn-keys.mjs"` เฉย ๆ ตรงนี้ — เอาออกแล้ว 19 ก.ย. 2569 ค่ำ**
 * ผมใส่มันเพื่อ "ให้ coverage เห็นไฟล์จริง" ⇒ แต่นั่นคือ **การทำให้ตัวเลขสวยขึ้นโดยไม่ได้ทดสอบอะไรเพิ่ม**
 * 🔑 ฝั่งจอเจอ artifact ทิศนี้ก่อน (`ตัดคอมเมนต์.mjs` โผล่ในรายงานเพราะมี import ตายในเทสหมุด
 *    พิสูจน์ด้วยการเอา import ออก ⇒ ไฟล์หายจากรายงานไปเลย) ⇒ ผมเอาเกณฑ์เขามาส่อง
 *    แล้วเจอว่า **ของที่ผมเพิ่มเมื่อชั่วโมงก่อนเป็นตัวอย่างของคลาสนั้นเอง**
 * ⇒ coverage ผิดได้สองทิศ และทั้งสองทิศอ่านเหมือนข้อเท็จจริง:
 *   · cache-buster query ⇒ **โหดเกินจริง** (มีเทสแต่รายงาน funcs 0%)
 *   · import ตาย ⇒ **ใจดีเกินจริง** (ไม่มีอะไรเรียก แต่ไฟล์ขึ้นในรายงาน)
 * 🚫 **ห้ามใส่ import เฉย ๆ กลับมาเพื่อดันตัวเลข** — ถ้าอยากให้ coverage เห็น ต้อง **เรียกของจริง**
 *    (ท่าที่ถูกอยู่ใน `deploy-state.test.mjs`: เรียกฟังก์ชันจากโมดูลที่ import ตรง) */


const อ่านตาราง = async () => {
  const m = await import(`../../netlify/lib/warn-keys.mjs?t=${Date.now()}`);
  return m.ตารางคีย์มีเงื่อนไข;
};

test("ตารางมีคีย์จริง + ประกาศขอบเขตของตัวเอง", async () => {
  const t = await อ่านตาราง();
  assert.ok(Array.isArray(t.คีย์) && t.คีย์.length > 10, "ต้องมีคีย์มากกว่า 10 ตัว");
  assert.ok(t.ขอบเขต.includes("ไม่ได้บอกว่าเส้นไหนออกคีย์ไหน"), "ต้องห้ามอ่านเกินเป็นรายเส้น");
  assert.ok(t.การสกัด.includes("อย่างน้อยเท่านี้"), "ต้องบอกว่าอ่านว่าอย่างน้อยเท่านี้");
  assert.ok(Array.isArray(t.ไฟล์ที่นับ) && t.ไฟล์ที่นับ.length > 5, "ต้องประกาศไฟล์ที่นับ ⇒ ตรวจย้อนได้");
  // 🔑 ป้ายต้องตรงกับสิ่งที่วัดได้ — รายชื่อมีคีย์ข้อมูลปนอยู่จริง จึงต้องเขียนบอก
  assert.ok(t["⚠️ ในรายชื่อนี้มีสองพันธุ์ปนกัน"], "ต้องประกาศว่ามีคีย์เตือน + คีย์ข้อมูลปนกัน");
});

test("คีย์ที่รู้ว่ามีอยู่จริงในท่อ ต้องอยู่ในรายชื่อ (ทิศบวก)", async () => {
  const t = await อ่านตาราง();
  for (const k of ["truncated", "limitClamped", "marketplacesStale", "depthCapped", "unverified"]) {
    // `truncated` อยู่ในรูปอื่น (คีย์ไทย) — เช็คเฉพาะตัวที่เป็นชื่ออังกฤษตรง ๆ
    if (k === "truncated") continue;
    assert.ok(t.คีย์.includes(k), `ต้องมี ${k} ในรายชื่อ`);
  }
});

test("🔑 สกัดใหม่ทุกครั้ง ไม่ใช่รายชื่อแช่ — ปลูกคีย์ใหม่แล้วต้องโผล่", () => {
  const path = "netlify/lib/pos.mjs";
  const เดิม = readFileSync(path, "utf8");
  /* 🔴 **ต้องจำไฟล์ตารางไว้คืนด้วย** (เพิ่ม 20 ก.ย. 2569)
     เดิมเทสนี้คืนแค่ซอร์สที่ปลูก แต่ `gen-warn-keys` ถูกเรียกสองครั้ง
     ⇒ `warn-keys.mjs` ได้ `"สร้างเมื่อ"` ใหม่ ⇒ **`npm test` ทำให้ git สกปรกทุกครั้ง**
     ⇒ ⇒ ท่ากิ่งทิ้งที่ต้องการ tree สะอาดใช้ไม่ได้ · และอีกบัญชีในเครื่อง pull ไม่ได้
     🔑 ไล่เจอด้วยการ bisect ขั้น prebuild ทีละขั้นเทียบ md5 — **`npm test` เป็นตัวเขียน**
        ซึ่งไม่มีใครสงสัยเลย เพราะ "เทส" ไม่ควรเปลี่ยนอะไรในรีโป
     🚫 คืนด้วย `writeFileSync` ตรง ๆ **ไม่ผ่าน `เขียนถ้าเนื้อเปลี่ยน`** เพราะที่นี่เราต้องการ
        เนื้อเดิมเป๊ะรวมทั้งบรรทัดเวลา */
  const ตารางเดิม = readFileSync("netlify/lib/warn-keys.mjs", "utf8");
  const ปลูก = "ZZ" + "NOPEZZ" + "KeyOnlyForTest";
  try {
    // ปลูกในรูป **ที่ของจริงเป็น** (spread แบบมีเงื่อนไข) ไม่ใช่รูปที่พิมพ์ง่าย
    const แทรก = `\nexport const __ปลูกทดสอบ = (c) => ({ ...(c ? { ${ปลูก}: 1 } : {}) });\n`;
    writeFileSync(path, เดิม + แทรก);
    assert.ok(readFileSync(path, "utf8").includes(ปลูก), "ปลูกไม่ลง ⇒ ผลเทสนี้ไม่มีค่า");
    execFileSync("node", ["scripts/gen-warn-keys.mjs"], { stdio: "ignore" });
    const ใหม่ = readFileSync("netlify/lib/warn-keys.mjs", "utf8");
    assert.ok(ใหม่.includes(ปลูก), "ปลูกคีย์ใหม่แล้วตัวสกัดต้องเห็น — ถ้าไม่เห็นคือรายชื่อแช่");
  } finally {
    writeFileSync(path, เดิม);
    execFileSync("node", ["scripts/gen-warn-keys.mjs"], { stdio: "ignore" }); // คืนตารางให้ตรงซอร์ส
    writeFileSync("netlify/lib/warn-keys.mjs", ตารางเดิม);   // แล้วคืนบรรทัดเวลาเดิมด้วย
  }
  assert.ok(
    !readFileSync("netlify/lib/warn-keys.mjs", "utf8").includes("ZZ" + "NOPEZZ"),
    "ต้องไม่เหลือร่องรอยของปลูกในตาราง"
  );
});

test("ตัวควบคุมลบ: คีย์ที่ไม่มีในท่อ ต้องไม่อยู่ในรายชื่อ", async () => {
  const t = await อ่านตาราง();
  for (const k of ["ZZ" + "NOPEZZ", "คีย์ที่ไม่มีจริง", "totallyMadeUpKey"]) {
    assert.equal(t.คีย์.includes(k), false, `ไม่ควรมี ${k}`);
  }
});

test("เส้น warnkeys ในท่อ: GET เท่านั้น + ประกาศว่า null แปลว่าอ่านไม่ได้", () => {
  const src = readFileSync("netlify/functions/core.mjs", "utf8");
  const i = src.indexOf('url.searchParams.get("warnkeys")');
  assert.ok(i > 0, "ต้องมีเส้น warnkeys");
  const บล็อก = src.slice(i, i + 1800);
  assert.match(บล็อก, /GET เท่านั้น/, "ต้องกัน method อื่นด้วย 405");
  assert.match(บล็อก, /null = \*\*อ่านตารางไม่ได้ ไม่ใช่ท่อไม่มีคีย์เลย\*\*/,
    "ต้องแยก 'อ่านไม่ได้' ออกจาก 'ไม่มีคีย์' — ยุบกันคือโรคที่เส้นนี้สร้างมาแก้");
  assert.match(บล็อก, /เวลาที่ build ไม่ใช่เวลาที่ยิงคำขอ/, "ต้องบอกว่าเวลาคือเวลา build");
});
