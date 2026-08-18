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
  const [watch, counts] = await Promise.all([
    readWatch(),
    store.get("counts", { type: "json" }).catch(() => null).then((c) => c || {}),
  ]);

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

  return json({ rows });
}

export const config = { path: "/api/clip-stats" };
