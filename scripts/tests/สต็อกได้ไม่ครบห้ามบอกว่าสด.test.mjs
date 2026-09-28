/* 🔴 ด่าน: **กวาดสต็อกได้ไม่ครบ ห้ามตอบว่า `stale: false`** (ใบบั๊ก B09 · 28 ก.ย. 2569)
 *
 * ของเดิมคืน `stale:false` ทุกครั้งที่กวาดสำเร็จ **แม้บางหน้าจะพลาดถาวร**
 * ธง `partial` มีอยู่ **แต่ผู้เรียกที่สำคัญไม่ได้อ่าน**:
 *   `products-feed.mjs:33` อ่าน `{map, at, stale}` · `catalog-feed.mjs:34` อ่าน `{map}`
 *   (มีแต่ `feed-health.mjs` ที่อ่าน `partial`) ⇒ **จอสุขภาพเห็น แต่ฟีดที่ AI ใช้ไม่เห็น**
 * ⇒ รหัสที่ตกหล่น **หายเงียบ ๆ โดยฟีดบอกว่าข้อมูลสดและครบ**
 * 🔑 กติกา: **ค่าที่ปลอดภัยต้องเป็นค่าที่ผู้เรียกได้จากการอ่านแบบง่ายที่สุด**
 *    ไม่ใช่ค่าที่ต้องรู้จักถามถึงก่อน
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const src = await readFile(new URL("../../netlify/lib/zort-stock.mjs", import.meta.url), "utf8");
/* 🔴 **ตัดท่อนต้องนับจากจุดเริ่ม ไม่ใช่หา `} catch {` จากต้นไฟล์**
 *    ครั้งแรกผมเขียน `src.indexOf("} catch {")` ⇒ ไปเจอ `} catch` ของการอ่านแคช (บรรทัด 177)
 *    ซึ่งอยู่ **ก่อน** ท่อนที่จะตรวจ ⇒ ได้ท่อนว่าง ⇒ **ด่านแดงทั้งที่โค้ดถูกแล้ว (แดงลวง)**
 *    🔑 คลาสเดียวกับที่เจอเช้านี้: ตัวชี้ที่หา "ครั้งแรกที่เจอ" ในของที่มีหลายตัว */
const เริ่ม = src.indexOf("const fresh = await scrape()");
const ท่อน = src.slice(เริ่ม, src.indexOf("} catch {", เริ่ม));

test("🔴 ได้ไม่ครบ ⇒ ต้องติด `stale: true` (ห้ามมีทาง return stale:false ในกิ่ง partial)", () => {
  assert.match(ท่อน, /if \(fresh\.partial\)/, "ต้องมีกิ่งแยกสำหรับกรณีได้ไม่ครบ");
  const กิ่ง = ท่อน.slice(ท่อน.indexOf("if (fresh.partial)"));
  const ก่อนจบกิ่ง = กิ่ง.slice(0, กิ่ง.indexOf("return { ...fresh, stale: false }"));
  assert.ok(!/stale:\s*false/.test(ก่อนจบกิ่ง.replace(/partial:\s*false/g, "")),
    "ในกิ่ง partial ห้ามคืน stale:false");
  assert.match(ก่อนจบกิ่ง, /stale:\s*true/, "กิ่ง partial ต้องคืน stale:true");
});

test("🔑 มีแคชเก่าที่ครบ ⇒ ต้องใช้ของเก่า (หลักของไฟล์นี้: ของเก่าที่จริง ดีกว่าของใหม่ที่ไม่ครบ)", () => {
  const กิ่ง = ท่อน.slice(ท่อน.indexOf("if (fresh.partial)"));
  assert.match(กิ่ง, /if \(cached\?\.map\)/, "ต้องเช็คว่ามีแคชเก่าก่อน");
  assert.match(กิ่ง, /\.\.\.cached/, "ต้องคืนข้อมูลจากแคชเก่า ไม่ใช่ของใหม่ที่ไม่ครบ");
});

test("✅ ครบ ⇒ ยังต้องคืน `stale: false` (ไม่ใช่แก้แล้วบอกว่าเก่าทุกครั้ง)", () => {
  assert.match(ท่อน, /return \{ \.\.\.fresh, stale: false \}/, "กรณีครบต้องยังบอกว่าสด");
});

test("📏 ต้องบอก **จำนวนหน้าที่พลาด** ไม่ใช่แค่ true/false", () => {
  assert.match(src, /หน้าที่พลาด: stillFailed\.length/,
    "ขาด 1 หน้าจาก 14 กับขาด 9 หน้า ต้องตัดสินใจคนละอย่าง ⇒ ต้องส่งจำนวนออกมา");
});

test("🚫 แคชต้องไม่ถูกเขียนทับด้วยของที่ไม่ครบ (ของเดิมถูกอยู่แล้ว — กันแก้พลาดภายหลัง)", () => {
  assert.match(ท่อน, /if \(!fresh\.partial\) await s\.setJSON/, "เขียนแคชเฉพาะเมื่อได้ครบ");
});
