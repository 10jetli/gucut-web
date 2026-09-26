/* 🔴 ด่าน: **สมุดงานต้องได้แถว แม้ตารางจริงไม่มีคอลัมน์ใหม่**
 *
 * 🔴 ที่มา 26 ก.ย. 2569 — ของจริงที่เพิ่งเจ็บ: `job_run_log` **ไม่ได้รับแถวเลย 6 วัน**
 *    (แถวสุดท้าย 20 ก.ย. 22:19Z) ทั้งที่งานตามเวลายังวิ่งอยู่จริง
 *    (พิสูจน์: contacts-sync มีหมุด 26 ก.ย. 15:19Z ตรงนาที cron · returns-sync 15:07Z ตรงนาที cron)
 *
 * 🔑 **เหตุจริง — ตะแกรงข้อความผิดคำ**
 *    โค้ดเดิมตัดสินว่า "คอลัมน์ยังไม่มี" ด้วย `/no such column/i`
 *    แต่ SQLite/D1 ตอบตอน **INSERT** ว่า `table X has no column named Y`
 *    (คำว่า `no such column` ใช้กับ **SELECT**) ⇒ เงื่อนไขไม่ตรง ⇒ `throw` ⇒ ไม่ถอย ⇒ **ไม่มีแถว**
 *    วัดจริงด้วย `node:sqlite` วันนี้:
 *      INSERT ⇒ "table t has no column named b"   ·   SELECT ⇒ "no such column: b"
 *
 * 🔑 คลาส: **ตัดสินสภาพจากถ้อยคำ error ของระบบอื่น** — ถ้อยคำไม่ใช่สัญญา
 *    และรอบนี้มันไม่ได้เปลี่ยนด้วยซ้ำ **เราอ่านผิดคำตั้งแต่วันที่เขียน** ⇒ ตะแกรงที่ไม่เคยถูกทดสอบ
 *
 * 🚫 ด่านนี้ต้องแดงกับโค้ดเก่า: ปลูกข้อความจริงของ SQLite แล้วดูว่ามีแถวถูกเขียนไหม
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ราก = fileURLToPath(new URL("../../netlify/lib/", import.meta.url));

/* คอลัมน์ที่ "ตารางจริง" มี — จงใจ **ไม่มี** caller/build เหมือนของจริงบนเว็บ */
const สภาพ = {
  คอลัมน์: ["job", "at", "ms", "outcome", "note", "sub_ok", "sub_fail"],
  เขียนแล้ว: [],
  pragmaล้ม: false,
  alterล้ม: true, // D1 จริงเติมคอลัมน์ไม่สำเร็จ (สมมติแย่สุด)
};

mock.module(ราก + "coredb.mjs", {
  namedExports: {
    coreReady: () => true,
    coreInit: async () => null,
    withD1Meter: (f) => f(),
    d1Stats: () => null,
    d1Info: () => null,
    coreQuery: async (sql, ค่า) => {
      if (/^\s*PRAGMA table_info/i.test(sql)) {
        if (สภาพ.pragmaล้ม) throw new Error("D1 ไม่รองรับ PRAGMA (ปลูก)");
        return สภาพ.คอลัมน์.map((name) => ({ name }));
      }
      if (/^\s*ALTER TABLE/i.test(sql)) {
        if (สภาพ.alterล้ม) throw new Error("ALTER ไม่สำเร็จ (ปลูก)");
        const m = sql.match(/ADD COLUMN (\w+)/);
        if (m) สภาพ.คอลัมน์.push(m[1]);
        return { results: [] };
      }
      if (/^\s*INSERT/i.test(sql)) {
        const ชื่อ = (sql.match(/\(([^)]+)\) VALUES/i)?.[1] ?? "").split(",").map((x) => x.trim());
        const ขาด = ชื่อ.find((c) => !สภาพ.คอลัมน์.includes(c));
        /* 🔑 ข้อความนี้คือ **ถ้อยคำจริงของ SQLite** ไม่ใช่ที่เราคิดเอง */
        if (ขาด) throw new Error(`table job_run_log has no column named ${ขาด}`);
        สภาพ.เขียนแล้ว.push({ ชื่อ, ค่า });
        return { results: [] };
      }
      if (/^\s*CREATE TABLE/i.test(sql)) return { results: [] };
      return { results: [] };
    },
  },
});

const { จดเวลางาน } = await import(ราก + "job-timing.mjs");

test("🔴 ตารางไม่มี caller/build ⇒ **ต้องยังได้แถว** (ของเดิมได้ศูนย์แถว)", async () => {
  สภาพ.เขียนแล้ว = [];
  const ผล = await จดเวลางาน({ งาน: "contacts-sync", ms: 1234, ผล: "ok", note: "ทดสอบ" });
  assert.equal(สภาพ.เขียนแล้ว.length, 1, `ต้องเขียนหนึ่งแถว · ได้ ${สภาพ.เขียนแล้ว.length} (ผล: ${ผล})`);
  const แถว = สภาพ.เขียนแล้ว[0];
  assert.ok(แถว.ชื่อ.includes("job") && แถว.ชื่อ.includes("outcome"), "ต้องมีช่องหลักครบ");
  assert.ok(!แถว.ชื่อ.includes("caller"), "ต้องไม่ยัดคอลัมน์ที่ตารางไม่มี");
  /* ⚠️ ทางถอยต้องประกาศตัว — ห้ามคืน "ok" เฉย ๆ แล้วให้คนเข้าใจว่าจดครบ */
  assert.match(String(ผล), /ไม่มีคอลัมน์|ชุดพื้นฐาน/, `ต้องบอกว่าจดไม่ครบ (ได้: ${ผล})`);
});

test("✅ ตารางมีครบ ⇒ เขียนชุดเต็ม และไม่มีคำเตือน", async () => {
  สภาพ.คอลัมน์ = ["job", "at", "ms", "outcome", "note", "sub_ok", "sub_fail", "caller", "build"];
  สภาพ.เขียนแล้ว = [];
  const ผล = await จดเวลางาน({ งาน: "slips-sync", ms: 10, ผล: "ok", ผู้เรียก: "cron" });
  assert.equal(สภาพ.เขียนแล้ว.length, 1);
  assert.ok(สภาพ.เขียนแล้ว[0].ชื่อ.includes("caller"), "ตารางมีคอลัมน์ ⇒ ต้องเขียนด้วย");
  assert.equal(ผล, "ok", `ครบแล้วต้องไม่มีคำเตือน (ได้: ${ผล})`);
});

test("🛡️ ถาม PRAGMA ไม่ได้ ⇒ ยังต้องเขียนได้ด้วยทางถอย และ **ประกาศว่าใช้ทางถอย**", async () => {
  สภาพ.คอลัมน์ = ["job", "at", "ms", "outcome", "note", "sub_ok", "sub_fail"];
  สภาพ.pragmaล้ม = true;
  สภาพ.เขียนแล้ว = [];
  const ผล = await จดเวลางาน({ งาน: "returns-sync", ms: 5, ผล: "ok" });
  สภาพ.pragmaล้ม = false;
  assert.equal(สภาพ.เขียนแล้ว.length, 1, `ทางถอยต้องได้แถว · ผล: ${ผล}`);
  assert.match(String(ผล), /ok/, "ต้องรายงานว่าเขียนได้");
});

test("🚫 ไม่โยน error ออกไปหางานจริง แม้ทุกคำสั่งล้ม", async () => {
  const เดิม = สภาพ.คอลัมน์;
  สภาพ.คอลัมน์ = [];              // ไม่มีคอลัมน์เลย ⇒ INSERT ล้มทุกทาง
  สภาพ.pragmaล้ม = true;
  await assert.doesNotReject(async () => {
    const ผล = await จดเวลางาน({ งาน: "backup-run", ms: 1, ผล: "failed" });
    assert.match(String(ผล), /จดไม่ได้|ok/, "ต้องคืนข้อความ ไม่ใช่โยน");
  });
  สภาพ.pragmaล้ม = false; สภาพ.คอลัมน์ = เดิม;
});
