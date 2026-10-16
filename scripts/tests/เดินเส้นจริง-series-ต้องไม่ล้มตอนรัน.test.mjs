// 🚦 **ด่านชั้นใหม่: เรียกตัวจัดการเส้นทาง "จริง" ไม่ใช่อ่านซอร์สเป็นข้อความ**
//
// 🔴 ของจริง 17 ต.ค. 2569 00:5x — `?list=topproducts&by=category&series=month` ตอบ 500
//    เนื้อจริง (เห็นได้เพราะยิงตรงที่ origin ข้าม Cloudflare): **`num2 is not defined`**
//    เหตุ: ผมหยิบชื่อตัวช่วยแปลงเลขจาก **บล็อกข้างเคียง** มาใช้ · `num2` เป็น const ท้องถิ่น
//      5 ที่ในไฟล์เดียว และทั้งหมดอยู่ **หลัง** บล็อก topproducts ⇒ ในขอบเขตนั้นไม่มีมันเลย
//
// 🔑 **เหตุที่ทุกด่านที่มีอยู่มองไม่เห็น**:
//    · `node --check`        ⇒ ไวยากรณ์ถูก (ตัวแปรอาจมาจากที่อื่นก็ได้)
//    · ตัวโหลดโมดูล          ⇒ โหลดผ่าน เพราะความผิดเกิดตอน **เดินเส้น**
//    · เทสที่อ่านซอร์ส        ⇒ ตรวจ "รูปของโค้ด" ไม่ได้รันโค้ด
//    · build                 ⇒ ไม่ได้ยิง endpoint
//    ⇒ **ReferenceError ข้างในตัวจัดการเส้นทาง มองไม่เห็นจากทุกชั้นที่ไม่ได้เดินเส้นนั้นจริง**
//
// 📏 และเทสในรีโปนี้ **ทุกตัวที่แตะ core.mjs อ่านมันเป็นข้อความเท่านั้น** ทั้งที่ไฟล์ export handler
//    ⇒ นี่คือด่านตัวแรกที่เดินเส้นจริง · ของที่มันจับได้คือของที่ชั้นอื่นจับไม่ได้โดยโครงสร้าง
import { mock, test } from "node:test";
import assert from "node:assert/strict";

/* ฐานปลอม — คืนแถวรูปเดียวกับที่คิวรี series คืนจริง */
/* ⚠️ ตัวปลอมต้องส่งออก **ครบทุกชื่อที่ core.mjs นำเข้า** ไม่งั้นโมดูลโหลดไม่ขึ้นเลย
   (รอบแรกผมใส่แค่สองชื่อ ⇒ SyntaxError: does not provide an export named 'coreInit')
   ⇒ ไล่จากของจริง: coreInit · coreQuery · coreReady · d1Info · d1Stats · withD1Meter */
mock.module("../../netlify/lib/coredb.mjs", { namedExports: {
  coreInit: async () => ({ ok: true }),
  d1Info: () => ({ ready: true }),
  d1Stats: () => ({ count: 0 }),
  withD1Meter: async (fn) => (typeof fn === "function" ? fn() : undefined),
  coreReady: () => true,
  coreQuery: async (sql) => {
    const s = String(sql);
    if (/GROUP BY 1,2 ORDER BY period, category/.test(s)) {
      return [
        { period: "2026-09", category: "โซ่ NEWWAVE", qty: 6712, amount: 112878.15 },
        { period: "2026-10", category: "โซ่ NEWWAVE", qty: 3350.5, amount: 54401.38 },
      ];
    }
    return [];
  },
} });
/* ด่านรหัสหลังร้าน — ให้ผ่าน เพราะด่านนี้ทดสอบ "เส้นเดินได้ไหม" ไม่ใช่ทดสอบการยืนยันตัว */
mock.module("../../netlify/lib/admin-gate.mjs", { namedExports: {
  adminGate: () => ({ wants: false, ok: true, deny: null }),
} });
mock.module("@netlify/blobs", { namedExports: {
  getStore: () => ({ get: async () => null, setJSON: async () => {}, list: async () => ({ blobs: [] }) }),
} });

const { default: handler } = await import("../../netlify/functions/core.mjs");
const ยิง = (qs) => handler(
  new Request(`https://gucut.com/api/core?${qs}`, { headers: { "x-admin-key": "x" } }),
  { geo: {} }
);

test("series=month เดินเส้นได้จริง ไม่ล้มตอนรัน (จับ num2 is not defined)", async () => {
  const res = await ยิง("list=topproducts&by=category&series=month&from=2026-07-01&to=2026-10-17");
  const body = await res.json();
  /* 🔴 ข้อนี้คือข้อที่จะแดงถ้าใครอ้างตัวช่วยที่ไม่มีในขอบเขตนั้นอีก */
  assert.equal(res.status, 200, `เส้นล้ม: ${JSON.stringify(body).slice(0, 200)}`);
  assert.equal(body.error, undefined, `มี error: ${body.error}`);
  assert.equal(body.applied?.series, "month");
  assert.deepEqual(body.series?.[0], { period: "2026-09", category: "โซ่ NEWWAVE", qty: 6712, amount: 112878.15 });
});

test("series=day ก็เดินได้ และค่าที่ไม่รู้จักตีกลับ 400", async () => {
  assert.equal((await ยิง("list=topproducts&by=category&series=day&from=2026-10-01&to=2026-10-17")).status, 200);
  assert.equal((await ยิง("list=topproducts&by=category&series=สัปดาห์&from=2026-10-01&to=2026-10-17")).status, 400);
  /* series ต้องใช้กับ by=category เท่านั้น */
  assert.equal((await ยิง("list=topproducts&series=month&from=2026-10-01&to=2026-10-17")).status, 400);
});

test("ไม่ขอ series ⇒ เส้นเดิมยังเดินได้ และไม่มีคีย์ series", async () => {
  const res = await ยิง("list=topproducts&by=category&from=2026-10-01&to=2026-10-17");
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal("series" in body, false);
});
