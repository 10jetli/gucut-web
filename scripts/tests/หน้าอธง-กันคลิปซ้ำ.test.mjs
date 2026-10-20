/* ด่าน: หน้า /ajthong/ ต้องไม่โชว์คลิปซ้ำ — ท่านประธานกำชับ 20 ต.ค. 2569 *"อย่าลงซ้ำหล่ะ ดูดีๆ"*
 *
 * 🔑 ป้อน **ฟีดปลอมที่มีใบซ้ำจริง** เข้าไปดูว่าถูกกรองไหม
 *    ไม่ใช่อ่านโค้ดแล้วเชื่อว่ากรอง — ด่านที่ไม่เคยถูกปลูกของซ้ำใส่ ให้ผลเขียวที่แปลว่า "ยังไม่เจอ"
 */
import test from "node:test";
import assert from "node:assert/strict";
import { อ่านฟีดอธง, คลิปซ้ำที่ห้ามโชว์, ช่องอธง } from "../../netlify/lib/ajthong-clips.mjs";

const entry = (id, ชื่อ = "คลิป") =>
  `<entry><yt:videoId>${id}</yt:videoId><title>${ชื่อ}</title>` +
  `<published>2026-10-20T01:00:00+00:00</published></entry>`;

test("ชั้นที่ 2 · ฟีดที่มีรหัสซ้ำกันเอง ต้องเหลือใบเดียว", () => {
  const xml = `<feed>${entry("AAAAAAAAAAA")}${entry("AAAAAAAAAAA", "ซ้ำ")}${entry("BBBBBBBBBBB")}</feed>`;
  const r = อ่านฟีดอธง(xml);
  assert.deepEqual(r.คลิป.map((c) => c.id), ["AAAAAAAAAAA", "BBBBBBBBBBB"]);
  assert.equal(r.ตัดเพราะซ้ำในฟีด, 1, "ต้องรายงานว่าตัดใบซ้ำไป 1 ใบ — ตัวกรองที่ไม่รายงานพิสูจน์ไม่ได้");
});

test("ชั้นที่ 2 · ซ้ำสามใบ ต้องเหลือใบเดียว (ไม่ใช่กันได้แค่ใบที่สอง)", () => {
  const xml = `<feed>${entry("CCCCCCCCCCC")}${entry("CCCCCCCCCCC")}${entry("CCCCCCCCCCC")}</feed>`;
  const r = อ่านฟีดอธง(xml);
  assert.equal(r.คลิป.length, 1);
  assert.equal(r.ตัดเพราะซ้ำในฟีด, 2);
});

test("ชั้นที่ 1 · รหัสที่อยู่ในรายการใบซ้ำเก่า ต้องไม่โผล่ ต่อให้ YouTube ยังมีอยู่", () => {
  const ใบซ้ำ = [...คลิปซ้ำที่ห้ามโชว์][0];
  const xml = `<feed>${entry(ใบซ้ำ)}${entry("DDDDDDDDDDD")}</feed>`;
  const r = อ่านฟีดอธง(xml);
  assert.deepEqual(r.คลิป.map((c) => c.id), ["DDDDDDDDDDD"]);
  assert.equal(r.ตัดเพราะอยู่ในรายการซ้ำ, 1);
});

test("🔑 ด่านต้องแยกแยะได้ · ฟีดที่ไม่มีของซ้ำเลย ต้องไม่ถูกตัดสักใบ (กันตัวกรองที่ตัดมั่ว)", () => {
  const xml = `<feed>${entry("EEEEEEEEEEE")}${entry("FFFFFFFFFFF")}${entry("GGGGGGGGGGG")}</feed>`;
  const r = อ่านฟีดอธง(xml);
  assert.equal(r.คลิป.length, 3);
  assert.equal(r.ตัดเพราะซ้ำในฟีด, 0);
  assert.equal(r.ตัดเพราะอยู่ในรายการซ้ำ, 0);
});

test("รหัสรูปแบบผิดต้องทิ้ง ไม่เดาและไม่พามันไปสร้าง iframe", () => {
  const xml = `<feed>${entry("สั้น")}${entry("มีช่องว่าง ไม่ได้")}${entry("HHHHHHHHHHH")}</feed>`;
  const r = อ่านฟีดอธง(xml);
  assert.deepEqual(r.คลิป.map((c) => c.id), ["HHHHHHHHHHH"]);
});

test("ฟีดว่าง/พัง ต้องได้รายการว่าง ไม่โยน error", () => {
  for (const x of ["", null, undefined, "<feed></feed>", "ไม่ใช่ xml เลย"]) {
    const r = อ่านฟีดอธง(x);
    assert.deepEqual(r.คลิป, []);
  }
});

test("รายการใบซ้ำต้องเป็น 21 ใบ ไม่ซ้ำกันเอง และรูปรหัสถูกทุกใบ", () => {
  const ล = [...คลิปซ้ำที่ห้ามโชว์];
  assert.equal(ล.length, 21, "รายชื่อใบซ้ำฉบับแก้ไข 20 ต.ค. 2569 มี 21 ใบ");
  assert.equal(new Set(ล).size, ล.length);
  for (const id of ล) assert.match(id, /^[A-Za-z0-9_-]{6,20}$/);
});

test("ลิงก์ฝังต้องเป็น youtube-nocookie และห้ามเป็นไฟล์คลิปของตัวเอง (กติกาลิขสิทธิ์)", () => {
  const r = อ่านฟีดอธง(`<feed>${entry("IIIIIIIIIII")}</feed>`);
  assert.equal(r.คลิป[0].ฝังที่, "https://www.youtube-nocookie.com/embed/IIIIIIIIIII");
  assert.match(r.คลิป[0].ดูที่, /^https:\/\/www\.youtube\.com\/watch\?v=/);
  assert.ok(!/\.mp4|\.m3u8|video\.gucut\.com/.test(JSON.stringify(r.คลิป)), "ห้ามมีลิงก์ไฟล์คลิป");
});

test("ช่องที่เฝ้าต้องเป็นช่องของ อ.ธง ที่พิสูจน์แล้ว", () => {
  assert.equal(ช่องอธง, "UCn1ZbCh5TK2eob3xuhyc9Og");
});

test("ชื่อคลิปต้องถอดเอนทิตี ไม่ให้ &amp; หลุดไปขึ้นจอ", () => {
  const r = อ่านฟีดอธง(`<feed>${entry("JJJJJJJJJJJ", "ไม้แดง &amp; ไม้สัก")}</feed>`);
  assert.equal(r.คลิป[0].ชื่อ, "ไม้แดง & ไม้สัก");
});
