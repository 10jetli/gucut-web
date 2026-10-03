// สถิติคลิป — /api/clip-stats  (หลังร้านเท่านั้น)
//
// ตอบคำถามที่เจ้าของร้านถาม 18 ส.ค. 2569: "คนดูคลิปนานไหม คลิปไหนดูเยอะ"
//
//   GET  → { rows: [{ id, views, half, full, likes, comments }] }
//
// ⚠️ ห้ามเอาไปรวมกับ /api/social ที่หน้าร้านเรียกทุกครั้งที่เปิดฟีด
//    ตัวนี้ยิง list ที่เก็บข้อมูล 3 รอบ (w/ q/ f/) ซึ่งหนักกว่ามาก
//    หน้าร้านต้องการแค่ยอดวิวกับหัวใจ ไม่ต้องรู้ความลึกในการดู
import { adminGate } from "../lib/admin-gate.mjs";
import { readWatch } from "../lib/views.mjs";
import { getStore } from "@netlify/blobs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async function handler(req, context) {
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  const store = getStore({ name: "gucut-social", consistency: "eventual" });
  /* 🔴 **B10 (แก้ 4 ต.ค. 2569)** — `counts` เดิม `.catch(() => null).then((c) => c || {})`
     ⇒ อ่านยอดหัวใจ/คอมเมนต์ไม่ได้ ⇒ `{}` ⇒ ทุกคลิปขึ้น 0 หัวใจ 0 คอมเมนต์
     🔑 `{}` ที่มาจาก "ไม่เคยมีใครกดหัวใจ" กับที่มาจาก "อ่านไม่ได้" **หน้าตาเหมือนกันเป๊ะ**
        ⇒ แยกเป็นธงส่งขึ้นจอ ไม่ใช่กลืนที่นี่ */
  let counts = {};
  let countsUnknown = false;
  try { counts = (await store.get("counts", { type: "json" })) || {}; }
  catch { countsUnknown = true; }

  const watch = await readWatch();

  const ids = new Set([
    ...Object.keys(watch.views),
    ...Object.keys(watch.half),
    ...Object.keys(watch.full),
    ...Object.keys(counts),
  ]);

  const rows = [...ids].map((id) => {
    const [likes = 0, comments = 0] = counts[id] || [];
    return {
      id,
      views: watch.views[id] || 0,
      half: watch.half[id] || 0,
      full: watch.full[id] || 0,
      likes,
      comments,
    };
  }).sort((a, b) => b.views - a.views || b.likes - a.likes);

  /* 🔑 **ธงต้องอยู่ในคำตอบเสมอ แม้ไม่มีปัญหา** (กติกาเดียวกับ `lib/blob-keys.mjs`)
     ไม่มีช่อง ≠ ไม่มีปัญหา — ถ้าซ่อนตอนปกติ จอจะแยก "ท่อรุ่นเก่าไม่ส่งมา" ออกจาก
     "อ่านได้ครบ" ไม่ได้ แล้วจะกลับไปเดาเหมือนเดิม
     ⚠️ และต้องส่งมา **ในเนื้อ JSON** ไม่ใช่พึ่งรหัสสถานะ — เส้นนี้ยังตอบ 200
        เพราะแถวที่อ่านได้ก็ยังมีประโยชน์ · จอที่ดักแค่ `r.ok` จึงมองไม่เห็นเคสนี้เลย */
  return json({ rows, unreadable: watch.unreadable, countsUnknown });
}

export const config = { path: "/api/clip-stats" };
