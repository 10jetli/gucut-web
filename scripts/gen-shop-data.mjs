// สร้าง netlify/lib/shop-data.mjs ตอน prebuild — ข้อมูลนิติบุคคล/ใบอนุญาตสำหรับฝั่งเซิร์ฟเวอร์
//
// ⚠️ **ทำไมต้องมีไฟล์นี้** (6 ก.ย. 2569 — คุณส้มขอ `?shopinfo=1`)
//    ข้อมูลตัวจริงอยู่ที่ `src/lib/shop.ts` + `src/lib/licenses.ts` ซึ่งเป็น TypeScript
//    ฟังก์ชันบน Netlify **อ่านไฟล์ใน src/ ตอนรันไม่ได้** (ไม่ได้ถูกรวมไปด้วย)
//    และหลังร้านตัวใหม่อยู่คนละ repo จึง import ข้ามไม่ได้
//    ⇒ แปลงเป็น .mjs ตอน build แล้วให้ทุกฝั่งอ่านจากที่เดียว
//    **ห้ามพิมพ์ข้อมูลนิติบุคคลซ้ำที่อื่นเด็ดขาด** — ต่ออายุใบอนุญาตทีเดียวต้องเปลี่ยนที่เดียว
//
// ⚠️ **ไม่ส่งที่อยู่ออกไปทั้งของผู้ขายและผู้ผลิต** — ไม่มีจอไหนต้องใช้
//    (ตรวจแล้ว 6 ก.ย. 2569: `scripts/lib/legal.mjs` คืนแค่ name/taxId อยู่แล้ว
//     บรรทัดตัด address ข้างล่างจึงเป็น **ตาข่ายกันวันที่มีคนเพิ่มช่องนั้นเข้ามา** ไม่ใช่โค้ดตาย)
//    ส่งออกไปเมื่อไหร่มันจะไปโผล่ในไฟล์ของ repo อื่นแทน = ย้ายปัญหา ไม่ใช่แก้
//    (กติกาห้ามเอาที่อยู่ขึ้นเว็บ · ตรวจแล้ววันนี้ว่าตัวจริงไม่ได้หลุดไปใน out/)
//
// ⚠️ ไฟล์นี้ห้ามทำให้ build ตกโดยไม่มีเหตุผล — แต่ **ถ้าอ่านข้อมูลกฎหมายไม่ได้ต้องตก**
//    ปล่อยผ่านแล้วเขียนไฟล์ว่าง = จอโชว์ "ไม่มีใบอนุญาต" ซึ่งเป็นคำยืนยันที่ผิดและอันตรายกว่า build ตก
import fs from "node:fs";
import path from "node:path";
import { LICENSEE, SELLER, LICENSES, TRADEMARKS, DISTRIBUTORSHIPS } from "./lib/legal.mjs";

/* ⚠️ **ตัดที่อยู่ออกจากทั้งสองนิติบุคคล ไม่ใช่เฉพาะผู้ผลิต** (แก้ 6 ก.ย. 2569)
    เดิมตัดเฉพาะ `licensee` ส่วน `seller` ส่งผ่านดิบ ๆ ⇒ **ตาข่ายครอบแค่ครึ่งเดียว**
    วันนี้ยังไม่หลุดเพราะ legal.mjs คืนแค่ name/taxId — แต่นั่นคือ "ถูกโดยบังเอิญ"
    วันที่มีคนเติม address ลง SELLER ใน shop.ts มันจะไหลลงไฟล์ที่ส่งให้เบราว์เซอร์ทุกคน
    **โดยไม่มีอะไรฟ้อง** และเป็นสิ่งที่เจ้าของร้านสั่งห้ามไว้ตรง ๆ (ดู [[gucut-no-public-address]]) */
const strip = (o) => {
  const { address, addr, ...rest } = o ?? {};
  return rest;
};
const licenseeSafe = strip(LICENSEE);
const sellerSafe = strip(SELLER);

if (!SELLER?.name) throw new Error("gen-shop-data: อ่านชื่อผู้ขายจาก shop.ts ไม่ได้");
if (!licenseeSafe?.name) throw new Error("gen-shop-data: อ่านชื่อผู้ผลิตจาก licenses.ts ไม่ได้");
if (!LICENSES?.length) throw new Error("gen-shop-data: อ่านใบอนุญาตไม่ได้สักฉบับ");

const data = {
  generatedAt: new Date().toISOString(),
  /* ⚠️ **สองนิติบุคคล ห้ามยุบรวมกัน**
      seller   = คนขายบนเว็บนี้ · ออกใบกำกับภาษี
      licensee = ผู้ผลิต/ผู้นำเข้า · เป็นคนถือใบอนุญาตเลื่อยโซ่ยนต์ทุกฉบับ
      เขียนว่าร้านถือใบอนุญาตเอง = อ้างใบของนิติบุคคลอื่นว่าเป็นของตัวเอง (เคยพลาดมาแล้ว) */
  seller: sellerSafe,
  licensee: licenseeSafe,
  licenses: LICENSES,
  trademarks: TRADEMARKS,
  distributorships: DISTRIBUTORSHIPS,
};

/* ⚠️ **ตาข่ายชั้นสอง — สแกนผลจริงก่อนเขียน ห้ามพึ่งการตัดคีย์อย่างเดียว**
    การตัดคีย์กันได้เฉพาะช่องที่เรารู้ชื่อ · ของที่ซ้อนอยู่ข้างใน (เช่น licenses[].address
    หรือคีย์ชื่ออื่นที่มีที่อยู่) ยังหลุดได้ ⇒ เดินทั้งก้อนแล้วโยน error ถ้าเจอ
    **ต้องโยน ห้ามเตือนเฉย ๆ** — ไฟล์นี้ถูกรวมเข้า .js ที่ส่งให้เบราว์เซอร์ทุกคน
    เปิดดูซอร์สก็เจอ · หลุดแล้วเอาคืนไม่ได้ (คนโหลดไปแล้ว) ⇒ build ตกดีกว่าที่อยู่หลุด */
const ADDRESS_KEYS = ["address", "addr", "street", "location"];
(function scanForAddress(node, trail) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach((v, i) => scanForAddress(v, `${trail}[${i}]`));
  for (const [k, v] of Object.entries(node)) {
    if (ADDRESS_KEYS.includes(k) && v)
      throw new Error(
        `gen-shop-data: เจอช่องที่อยู่ที่ ${trail}.${k} — ห้ามส่งที่อยู่ร้านออกหน้าเว็บ ` +
          `(เอาออกจากต้นทางใน shop.ts / licenses.ts หรือเพิ่มการตัดใน strip())`
      );
    scanForAddress(v, `${trail}.${k}`);
  }
})(data, "data");

const out = `// สร้างอัตโนมัติโดย scripts/gen-shop-data.mjs ตอน build — **ห้ามแก้ด้วยมือ**
// แก้ที่นี่จะถูกเขียนทับรอบหน้า · ต้นทางจริงคือ src/lib/shop.ts กับ src/lib/licenses.ts
// ⚠️ ไม่มีที่อยู่ผู้ผลิตในไฟล์นี้โดยตั้งใจ (ดูเหตุผลใน scripts/gen-shop-data.mjs)
export const SHOP_DATA = ${JSON.stringify(data, null, 2)};
`;

const dest = path.join(process.cwd(), "netlify/lib/shop-data.mjs");
fs.writeFileSync(dest, out);
console.log(
  `gen-shop-data: ผู้ขาย ${SELLER.name} · ผู้ผลิต ${licenseeSafe.name} · ` +
    `ใบอนุญาต ${LICENSES.length} · เครื่องหมายการค้า ${TRADEMARKS.length} · ` +
    `หนังสือแต่งตั้ง ${DISTRIBUTORSHIPS.length}`
);
