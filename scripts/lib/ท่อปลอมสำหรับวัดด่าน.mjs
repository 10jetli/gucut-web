/* 🧪 **ท่อปลอม** — มีไว้ให้ "ด่านที่ต้องมีเว็บจริง" ถูกพิสูจน์ได้ ทั้งที่ยังไม่เปิด deploy
 *
 * 🔴 ที่มา 20 ก.ย. 2569 — ฝั่งจอเขียนบทเรียน `the-checkers-closest-to-reality-are-the-least-proven`:
 *    ตัวตรวจที่ยิงของจริงต้องมีเว็บ/คีย์ ⇒ รันในลูกโซ่ build ไม่ได้ ⇒ ไม่มีใครเอาเข้าทะเบียนด่าน
 *    ⇒ **หลุดจากทั้งตัวเศษและตัวส่วนพร้อมกัน** = ตัวตรวจที่ใกล้ความจริงที่สุด กลายเป็นตัวที่ถูกตรวจน้อยที่สุด
 *    ทางออก: ตัวตรวจพวกนี้รับที่อยู่จาก env (`SITE` · `GUCUT_CORE_AUDIT_URL`)
 *    ⇒ **เล็งมาที่ท่อปลอมตัวนี้ได้** แล้วปลูกความผิดไว้ใน **คำตอบ** (ไม่ใช่ในซอร์สของด่าน)
 *
 * 🚫 **ขอบเขต — อ่านก่อนเชื่อผลที่ได้จากไฟล์นี้**
 *    ① พิสูจน์ได้อย่างเดียวคือ "ด่านแยกคำตอบดีจากคำตอบเสียได้ไหม"
 *       **ไม่** พิสูจน์ว่ามันเล็งโดเมนถูก เส้นถูก หรือคีย์จริงใช้ได้
 *       (กฎของทีม: ตัวปลอมมองไม่เห็นมิติที่ตัวเองไม่มี)
 *    ② คำตอบ "ของดี" ในนี้เป็นรูปที่ **เราเชื่อว่า** ท่อจริงตอบ — ถ้าท่อจริงเปลี่ยนรูป
 *       ไฟล์นี้จะยังเขียวอยู่เงียบ ๆ ⇒ **ห้ามใช้แทนการยิงของจริงหลัง deploy**
 *       (`verify-claims.mjs` ยังเป็นชั้นที่ตัดสินอยู่เหมือนเดิม)
 *    ③ ⚠️ **สามที่ที่ภาษาไทยใช้ไม่ได้ และพังคนละแบบ — เหยียบครบสามที่แล้ว 20 ก.ย. 2569**
 *       · **ชื่อตัวแปร/ชื่อ env ในเชลล์** ⇒ `exit 127` เงียบ ๆ (คำสั่งไม่ได้รัน แต่ผลอ่านเหมือนด่านแดง)
 *       · **ค่าในหัว HTTP** ⇒ `ERR_INVALID_CHAR` โยนทิ้งทั้งคำขอ (เคยเขียนเตือนไว้ใน CLAUDE.md
 *         เรื่อง `CHAT_ADMIN_KEY` แล้ว แต่ผมไปใส่ที่ `x-core-build` กับค่าคีย์ปลอมแทน)
 *       ⇒ ในไฟล์นี้ **ค่าที่วิ่งผ่านหัว HTTP หรือผ่านเชลล์ ต้องเป็น ASCII ทั้งหมด**
 *          (ข้อความไทยอยู่ใน **body** ได้ตามปกติ — นั่นคือ JSON ไม่ใช่หัว)
 *    ④ ⚠️ ชื่อ env ต้องเป็น **ASCII เท่านั้น** — ตั้งชื่อไทยในเชลล์ไม่ได้ (ล้มด้วย exit 127 เงียบ ๆ
 *       แล้วด่านจะแดงเพราะ "ยิงไม่ถึง" ซึ่งหน้าตาเหมือน "ด่านจับได้") เหยียบมาแล้ว 20 ก.ย. 2569
 */
import { createServer } from "node:http";

/** คำตอบ "ของดี" ของ /api/netlify-credits — คีย์ตามสัญญากับฝั่งจอ 19 ก.ย. 2569 */
export const เครดิต = {
  used: 1, plan: "stub", burnPerDay: 1, daysLeft: 9, burnWindowHours: 24,
  "ตัวอย่างล่าสุดเมื่อ": "2026-09-20T00:00:00Z", "ตัวอย่างเก่าเกินชั่วโมง": false,
};

/** คำตอบ "ของดี" ของ /api/returns-feed */
export const ใบคืนสินค้า = {
  list: [], unreadable: 0, qtyUnreadableLines: 0, qtyZeroLines: 0, priceUnreadableLines: 0,
};

/** คำตอบ "ของดี" ของ /api/core?list=… */
export const คำตอบlist = {
  ok: true, rows: [], limitClamped: false, skip: null,
  "สัญญาของเส้นนี้": {
    "ไล่หน้า": "limit/offset",
    "ต้องมี": [],
    "ชื่อที่โผล่ในบล็อก": [],
    "ชื่อที่โผล่ในบล็อก—อ่านยังไง": "อย่างน้อยเท่านี้ ไม่ใช่เท่านี้เท่านั้น",
  },
  applied: { q: null, from: null },
};

/** ตารางตัดสินสถานะของ `audit-core-contract` — GET อ่านได้ · ขาเขียนต้องถูกปฏิเสธ */
export function สถานะที่ควรตอบ(method, query) {
  const มี = (s) => query.includes(s);
  const ขาเขียน = ["addsale=", "addcontact=", "addbundle=", "addwarehouse=",
    "updateproduct=", "productimage=", "deleteproduct=", "zortproduct=", "productlabels="];
  if (method === "GET") return ขาเขียน.some(มี) ? 405 : 200;
  if (method === "POST") {
    if (มี("move=1") || มี("addcontact=1")) return 400;   // ต้องตีกลับก่อนเขียน
    return 405;
  }
  if (method === "DELETE") {
    if (มี("movedel=")) return /movedel=\d+/.test(query) ? 200 : 400;
    if (มี("deleteproduct=")) return 400;
    return 405;
  }
  return 405;
}

/* 🔑 **โหมด "ประกาศว่ารับตัวกรองแต่เมิน"** (เพิ่ม 20 ก.ย. 2569)
   ที่มา: เล็ง `probe-list-filters` มาที่ท่อปลอมแล้วมันตอบ "วัดไม่ได้ เพราะค่าฐาน 0 แถว"
   ⇒ **ซื่อสัตย์ แต่ยังไม่แยกแยะ** — ท่อปลอมไม่เคยเข้าสภาพที่ด่านนั้นมีไว้จับ
   ⇒ โหมดนี้จึงคืนแถวจริงจำนวนหนึ่ง **และเมินทุกตัวกรอง** ทั้งที่ `applied` ประกาศว่าพิจารณา
   🔑 นี่คือ "ปุ่มกรองหลอก" ตรงตัว — รูปที่ทีมเจอของจริงมาหลายรอบ */
const แถวปลอม = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `แถว ${i + 1}`, sku: `SKU${i + 1}` }));

/** เปิดท่อปลอมที่พอร์ตว่าง — คืน { ที่อยู่, ปิด } */
export function เปิดท่อปลอม({ ถอดคีย์เครดิต = "", ถอดapplied = false, เมินตัวกรอง = false } = {}) {
  const credits = { ...เครดิต };
  if (ถอดคีย์เครดิต) delete credits[ถอดคีย์เครดิต];
  const list = { ...คำตอบlist };
  if (ถอดapplied) delete list.applied;

  const server = createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const query = u.search.replace(/^\?/, "");
    const หัว = { "content-type": "application/json", "x-core-build": "stub-local" };
    if (u.pathname === "/api/netlify-credits") {
      res.writeHead(200, หัว); res.end(JSON.stringify(credits)); return;
    }
    if (u.pathname === "/api/returns-feed") {
      res.writeHead(200, หัว); res.end(JSON.stringify(ใบคืนสินค้า)); return;
    }
    const st = สถานะที่ควรตอบ(req.method, query);
    if (st === 400 && query.includes("deleteproduct=")) {
      res.writeHead(400, หัว); res.end(JSON.stringify({ error: "id ต้องเป็นตัวเลข" })); return;
    }
    if (st !== 200) { res.writeHead(st, หัว); res.end(JSON.stringify({ error: "ปฏิเสธ" })); return; }
    if (เมินตัวกรอง) {
      /* เมินทุกตัวกรอง: ส่งแถวชุดเดิมและ total เดิมเสมอ ไม่ว่าคำขอจะใส่อะไรมา */
      res.writeHead(200, หัว);
      /* 🔑 ด่าน `probe-list-filters` ถือ **`supportedFilters`** เป็น "คำประกาศ" (อ่านตัวจับแล้ว
         บรรทัด ~197: เทียบ `supportedFilters` กับที่วัดได้ ⇒ "ประกาศไว้แต่วัดแล้วเมิน")
         ⇒ โหมดนี้จึง **ประกาศว่ากรอง `q` และ `sku` จริง** แล้ว **เมินทั้งคู่**
         ⇒ นั่นคือสภาพ "ปุ่มกรองหลอก" ที่ด่านมีไว้จับพอดี */
      res.end(JSON.stringify({ ...list, rows: แถวปลอม(5), total: 5, supportedFilters: ["q", "sku"] }));
      return;
    }
    res.writeHead(200, หัว); res.end(JSON.stringify(list));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ ที่อยู่: `http://127.0.0.1:${port}`, ปิด: () => new Promise((r) => server.close(r)) });
    });
  });
}
