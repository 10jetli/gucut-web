/* 🔴 ด่าน: **คิวคำสั่งจากแว่น — ใบเดียวต้องไม่ถูกหยิบสองรอบ และ "ไม่มีงาน" ต้องต่างจาก "ถามไม่ได้"**
 *
 * 🔴 ที่มา 28 ก.ย. 2569: ตัวรับบน g1 (`~/bin/รับคำสั่งจากแว่น.py` · เขียน 06:02) เรียก
 *    `?hermesq=claim` มาตลอด **แต่ท่อไม่เคยมีเส้นนี้** ⇒ `/api/core` ตกไปที่คำตอบหน้าแรก + **HTTP 200**
 *    ⇒ ตัวรับอ่าน `งาน` ไม่เจอ ⇒ **เงียบเหมือนไม่มีงาน ตลอดกาล** · ใบงานบนกระดานเขียนว่า
 *      "เขียนเสร็จ รอ push" ทั้งที่ `hermesq` **ไม่เคยมีใน git เลยสักบรรทัด** (ตรวจด้วย `git log -S`)
 * 🔑 คลาส: **ฝั่งหนึ่งเสร็จ อีกฝั่งไม่มี แล้วผลลัพธ์หน้าตาเหมือนทำงานปกติ**
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const ราก = fileURLToPath(new URL("../../netlify/lib/", import.meta.url));

/** ฐานปลอมที่จำสถานะจริง — ไม่ใช่แค่คืนค่าคงที่ (ตัวปลอมที่ไม่มีสถานะจะไม่เห็นบั๊ก "หยิบซ้ำ") */
const ตาราง = [];
let นาฬิกา = 0;                       // นาทีสมมติ ใช้แทน datetime('now')
const เวลา = () => `2026-09-28 0${Math.floor(นาฬิกา / 60)}:${String(นาฬิกา % 60).padStart(2, "0")}:00`;

mock.module(ราก + "coredb.mjs", {
  namedExports: {
    coreReady: () => true,
    แถวจากผล: (x) => (Array.isArray(x) ? x : (() => { throw new Error("รูปผิด"); })()),
    coreQuery: async (sql, ค่า = []) => {
      const q = sql.replace(/\s+/g, " ").trim();
      if (/^CREATE/i.test(q)) return [];
      if (/^INSERT INTO hermes_queue/i.test(q)) {
        ตาราง.push({ id: ค่า[0], cmd: ค่า[1], who: ค่า[2], at: เวลา(), claimed_at: null, done_at: null, result: null });
        return [];
      }
      if (/COUNT\(\*\) AS n FROM hermes_queue WHERE done_at IS NULL/i.test(q)) {
        return [{ n: ตาราง.filter((r) => !r.done_at).length }];
      }
      if (/SELECT id, cmd FROM hermes_queue/i.test(q)) {
        const นาที = Number(String(ค่า[0]).match(/-(\d+) minutes/)?.[1] ?? 0);
        const เปิด = ตาราง.filter((r) => !r.done_at &&
          (!r.claimed_at || Number(r.claimed_at.slice(14, 16)) + นาที <= นาฬิกา));
        return เปิด.length ? [{ id: เปิด[0].id, cmd: เปิด[0].cmd }] : [];
      }
      if (/UPDATE hermes_queue SET claimed_at/i.test(q)) {
        const r = ตาราง.find((x) => x.id === ค่า[0]); if (r) r.claimed_at = เวลา(); return [];
      }
      if (/SELECT id, done_at FROM hermes_queue WHERE id/i.test(q)) {
        const r = ตาราง.find((x) => x.id === ค่า[0]);
        return r ? [{ id: r.id, done_at: r.done_at }] : [];
      }
      if (/UPDATE hermes_queue SET done_at/i.test(q)) {
        const r = ตาราง.find((x) => x.id === ค่า[1]); if (r) { r.done_at = เวลา(); r.result = ค่า[0]; } return [];
      }
      if (/ORDER BY at DESC/i.test(q)) return [...ตาราง].reverse();
      throw new Error("คำสั่งที่ตัวปลอมไม่รู้จัก: " + q.slice(0, 80));
    },
  },
});

const { ฝากงานแว่น, ขอใบถัดไป, ปิดใบ, ส่องคิว, หมดอายุการหยิบ_นาที } = await import(ราก + "hermes-queue.mjs");

test("✅ ฝากแล้วหยิบได้ และคำสั่งที่ได้ตรงกับที่ฝาก", async () => {
  const ฝาก = await ฝากงานแว่น({ cmd: "เปิดหน้าออเดอร์วันนี้", who: "แว่น" });
  assert.ok(ฝาก.id, `ต้องได้ id · ได้ ${JSON.stringify(ฝาก)}`);
  const ได้ = await ขอใบถัดไป();
  assert.equal(ได้["งาน"].id, ฝาก.id);
  assert.equal(ได้["งาน"].cmd, "เปิดหน้าออเดอร์วันนี้");
});

test("🔴 **หยิบซ้ำทันทีต้องไม่ได้ใบเดิม** (ไม่งั้น Hermes ทำงานสองรอบ · ผลเข้า Telegram สองครั้ง)", async () => {
  const ซ้ำ = await ขอใบถัดไป();
  assert.equal(ซ้ำ["งาน"], null, `รอบสองต้องว่าง · ได้ ${JSON.stringify(ซ้ำ["งาน"])}`);
});

test("🔑 ไม่มีงาน ⇒ `งาน: null` พร้อม `ok: true` — ต่างจาก 'ถามไม่ได้' ซึ่งตัวรับต้องแยกออก", async () => {
  const ว่าง = await ขอใบถัดไป();
  assert.equal(ว่าง.ok, true);
  assert.equal(ว่าง["งาน"], null);
  assert.ok(!("error" in ว่าง), "ว่างไม่ใช่ error");
});

test("⏱️ ใบที่ถูกหยิบแล้วเครื่องตาย ⇒ เกินเวลาแล้วต้องหยิบได้อีก (ไม่ค้างตลอดกาล)", async () => {
  นาฬิกา += หมดอายุการหยิบ_นาที + 1;
  const กลับมา = await ขอใบถัดไป();
  assert.ok(กลับมา["งาน"], "เกินเวลาหยิบแล้วต้องได้ใบเดิมกลับมา");
});

test("✅ ปิดใบแล้วต้องไม่ถูกหยิบอีก", async () => {
  const เปิด = await ส่องคิว({ limit: 5 });
  const ใบ = เปิด.rows.find((r) => !r.done_at);
  const ปิด = await ปิดใบ({ id: ใบ.id, ผล: "เรียบร้อย" });
  assert.equal(ปิด.ok, true);
  นาฬิกา += 60;
  assert.equal((await ขอใบถัดไป())["งาน"], null, "ปิดแล้วห้ามกลับมา");
});

test("🔴 ปิดใบที่ไม่มีอยู่ ⇒ **ต้องบอกว่าไม่เจอ** ห้ามตอบ ok (ตัวรับใช้ค่านี้เตือนว่าอาจถูกหยิบซ้ำ)", async () => {
  const r = await ปิดใบ({ id: "ไม่มีจริง" });
  assert.equal(r.ok, false);
  assert.match(String(r.error), /ไม่พบ/);
});

test("🔴 ฝากคำสั่งว่าง ⇒ ตีกลับ ห้ามสร้างใบเปล่าให้ Hermes ไปรัน", async () => {
  for (const c of ["", "   ", null, undefined]) {
    const r = await ฝากงานแว่น({ cmd: c });
    assert.ok(r.error, `cmd=${JSON.stringify(c)} ต้องถูกตีกลับ`);
  }
});

test("🚫 ต้องมีเส้น `hermesq` ใน core.mjs จริง — ไม่ใช่มีแต่โมดูล (บทเรียนของใบนี้เอง)", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../../netlify/functions/core.mjs", import.meta.url), "utf8");
  assert.match(src, /searchParams\.has\("hermesq"\)/, "core.mjs ต้องรู้จัก ?hermesq");
  assert.match(src, /hermes-queue\.mjs/, "core.mjs ต้อง import โมดูลคิว");
});
