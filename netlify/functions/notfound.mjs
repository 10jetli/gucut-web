// จดว่ามีคนเปิดหน้าที่ไม่มีอยู่ — /api/notfound
//
// ทำไมต้องรู้: URL เก่าสมัยอยู่ Shopify ยังมีคนแชร์อยู่ตามเว็บและแชท
// คนกดเข้ามาแล้วเจอ "ไม่พบหน้า" แล้วออกไปเลย เราไม่มีทางรู้เลยว่าเสียลูกค้าไปกี่คน
// พอรู้ว่าใครกดเข้าหน้าไหนบ่อย ก็ทำทางเปลี่ยนเส้นทางไปหน้าที่ถูกได้
//
// ⚠️ เก็บแบบ "หนึ่งหน้า = หนึ่งคีย์ต่อวัน" แล้วนับคีย์ ตามกติกาเดิมของโปรเจกต์
//    ห้ามอ่านมาบวกแล้วเขียนกลับ คนเข้าพร้อมกันจะเขียนทับกันจนนับหาย
import { getStore } from "@netlify/blobs";
import { identify, decPath } from "../lib/aibots.mjs";
import { adminGate } from "../lib/admin-gate.mjs";

const day = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const enc = (p) => encodeURIComponent(String(p || "/")).replace(/%/g, "~").slice(0, 150);

export default async function handler(req, context) {
  // ---------- ฝั่งร้าน: ดูว่ามีคนเปิดหน้าไหนแล้วเจอทางตันบ้าง ----------
  if (req.method === "GET") {
    const gate = await adminGate(req, context);
    if (gate.deny) return gate.deny;
    if (!gate.ok) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" },
      });
    }
    const s = getStore({ name: "gucut-live", consistency: "eventual" });
    const { blobs } = await s.list({ prefix: "nf/" });
    const count = {};
    for (const b of blobs) {
      const [, d, enc] = b.key.split("/");
      if (!d || !enc) continue;
      const path = decPath(enc);
      (count[path] ||= { path, hits: 0, days: new Set() });
      count[path].hits += 1;
      count[path].days.add(d);
    }
    const rows = Object.values(count)
      .map((r) => ({ path: r.path, days: r.days.size }))
      .sort((a, b) => b.days - a.days)
      .slice(0, 40);
    return new Response(JSON.stringify({ rows, total: Object.keys(count).length }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  if (req.method !== "POST") return new Response(null, { status: 204 });

  let body;
  try { body = await req.json(); } catch { return new Response(null, { status: 204 }); }

  // บอตไม่ต้องนับ — เราสนว่า "คนจริง" เจอทางตันตรงไหน
  if (identify(req.headers.get("user-agent") || "")) return new Response(null, { status: 204 });

  const path = String(body?.path || "").slice(0, 200);
  if (!path || !path.startsWith("/")) return new Response(null, { status: 204 });

  try {
    const s = getStore({ name: "gucut-live", consistency: "eventual" });
    await s.setJSON(`nf/${day()}/${enc(path)}`, {
      from: String(body?.from || "").slice(0, 200),   // มาจากลิงก์ไหน
      at: Date.now(),
    });
  } catch { /* จดไม่ได้ก็ไม่เป็นไร ห้ามให้กระทบหน้าเว็บ */ }

  return new Response(null, { status: 204 });
}

export const config = { path: "/api/notfound" };
