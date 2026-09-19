/* ด่าน: เส้นที่คืนอาเรย์แถว **ต้องบอก limit ที่ใช้จริง** ⇒ ตัวช่วยไล่หน้าจึงทำงานได้
 *
 * 🔴 ที่มา 19 ก.ย. 2569: ฝั่งจอเสียเวลาสองรอบเพราะเดาว่าเส้นหนึ่งไล่หน้าด้วย `page`
 *    (ของจริงใช้ `offset`) แล้ว **เกือบรายงานว่าท่อไล่หน้าไม่ได้**
 *    ⇒ ยิงวัดทั้ง 24 เส้น `list=` แล้วพบว่า **2 เส้นไม่มีคีย์ `nextOffset`/`nextPage` เลย**
 *      (`quotations` · `returnorders`) เพราะไม่ได้บอก limit ที่ใช้ ⇒ `paging-hint` ข้ามไป
 *    🔑 **ไม่มีคีย์ ≠ ไม่รองรับ** — ปลายทางแยกสองอย่างนี้ไม่ออก จึงต้องเดา แล้วเดาผิด
 *
 * 🔑 กติกา: `paging-hint.mjs` เติม `nextOffset`/`nextPage`/`pagingDone` ให้เอง
 *    **ถ้าคำตอบมีอาเรย์แถว และมี limit ที่ใช้จริง** ⇒ เส้นไหนลืมบอก limit ก็หายไปเงียบ ๆ
 *    ⇒ ด่านนี้บังคับว่าเส้นที่คืนแถวต้องมีทางให้รู้ limit
 *
 * ⚠️ ด่านนี้อ่าน **ซอร์ส** ไม่ได้ยิงของจริง ⇒ ครอบได้แค่รูปที่มองเห็นในโค้ด
 *    ตัวที่ยืนยันของจริงคือการยิงหลัง deploy (ทำแล้ว 19 ก.ย. — 12 จาก 14 เส้นมีคีย์ครบ)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rowsOf, withPagingHint } from "../../netlify/lib/paging-hint.mjs";

test("คำตอบที่มีแถวแต่ไม่บอก limit ⇒ ไม่ได้คีย์ไล่หน้าเลย (นี่คือกับดัก)", () => {
  const ไม่บอก = withPagingHint({ rows: [1, 2] }, NaN, {});
  assert.ok(!("nextOffset" in ไม่บอก), "ไม่บอก limit ⇒ ไม่มีคีย์ไล่หน้า — ปลายทางแยกไม่ออกว่ารองรับไหม");
  const บอก = withPagingHint({ rows: [1, 2] }, 2, {});
  assert.ok("nextOffset" in บอก && "nextPage" in บอก, "บอก limit ⇒ ต้องได้ทั้งสองคี่ย์");
  /* 🔑 ตัวที่ไม่ได้ใช้ต้องเป็น `null` ไม่ใช่หายไป — `null` อ่านได้ว่า "รองรับ แต่ทางนี้ไม่ใช้" */
  assert.equal(บอก.nextPage, null);
  assert.equal(บอก.nextOffset, 2);
});

test("สองเส้นที่เคยลืมบอก limit ต้องบอกแล้ว (quotations · returnorders)", () => {
  const src = readFileSync("netlify/lib/core-purchases.mjs", "utf8");
  /* ผูกกับ **เจตนา**: ฟังก์ชันนั้นต้องมีการส่ง limit ออกไปในคำตอบ
     ไม่ผูกกับถ้อยคำหรือลำดับบรรทัด (เคยพลาด 3 ครั้งวันนี้ที่ผูกกับรูปโค้ด) */
  for (const ชื่อ of ["listQuotations", "listReturnOrders"]) {
    const i = src.indexOf(`export async function ${ชื่อ}`);
    assert.ok(i > 0, `หา ${ชื่อ} ไม่เจอ — เปลี่ยนชื่อฟังก์ชันแล้วต้องมาแก้ด่านนี้`);
    const ถัดไป = src.indexOf("\nexport ", i + 10);
    const body = src.slice(i, ถัดไป > 0 ? ถัดไป : undefined);
    assert.match(
      body, /\n\s*limit:\s/,
      `${ชื่อ} ต้องส่ง limit ที่ใช้จริงออกไปในคำตอบ ไม่งั้นตัวช่วยไล่หน้าจะไม่เติมคีย์ให้ ` +
        "⇒ ปลายทางต้องเดาว่าไล่ด้วย page หรือ offset (เคยทำให้เสียเวลาสองรอบ 19 ก.ย. 2569)",
    );
  }
});

test("rowsOf ต้องรู้จักชื่ออาเรย์แถวที่โปรเจกต์ใช้จริง", () => {
  for (const k of ["rows", "items", "list", "orders", "products", "contacts", "moves"]) {
    assert.ok(Array.isArray(rowsOf({ [k]: [] })), `ไม่รู้จักคีย์แถวชื่อ ${k}`);
  }
  /* ⚠️ ไม่มีอาเรย์แถว ⇒ ต้องคืน null **ไม่ใช่ []** — "ไม่รู้จำนวนแถว" ≠ "ไม่มีแถว" */
  assert.equal(rowsOf({ total: 5 }), null);
});

/* 🧪 ปลูกบั๊กพิสูจน์แล้ว 19 ก.ย. 2569:
 *    ถอด `limit: n` ออกจาก listQuotations ⇒ แดง
 *    แก้ paging-hint ให้ใส่เฉพาะตัวที่ใช้ (ของเดิมก่อนแก้เมื่อเช้า) ⇒ แดง
 */
