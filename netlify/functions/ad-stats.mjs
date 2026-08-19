// ค่าโฆษณา vs ยอดขายจริง — /api/ad-stats
//
//   GET  ?admin=1            ค่าที่ตั้งไว้ (ไม่มีโทเคนติดมา)
//   GET  ?report=1&days=7    รายงานจริง: ดึงจาก Facebook + นับออเดอร์ของเราเอง
//   POST {...}               บันทึกค่า
//
// ⚠️ ห้ามแคช — เป็นข้อมูลหลังร้านล้วน และมีโทเคนอยู่ในเส้นทางเดียวกัน
import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";
import { facebookInsights, publicView, readConfig, saveConfig } from "../lib/adstats.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const pad = (n) => String(n).padStart(2, "0");
const ymd = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ---------------------------------------------------------------------------
// ยอดขายจริงจากออเดอร์ในระบบเราเอง
//
// ⚠️ นี่คือสิ่งที่ตัวกลางอย่าง Supermetrics ทำไม่ได้ — เขาเห็นแค่ตัวเลขที่พิกเซล
//    รายงานกลับไป ซึ่งขาดไปมากเพราะตัวบล็อกโฆษณาและ iOS ตัดคุกกี้
//    ส่วนเรานับจาก "ออเดอร์ที่เข้าระบบจริง" จึงไม่มีทางขาด
//
// ⚠️ นับเฉพาะออเดอร์ที่ยังไม่ถูกยกเลิก · ออเดอร์ที่รอจ่ายยังไม่นับเป็นเงินเข้า
// ---------------------------------------------------------------------------
async function ownSales(sinceTs, untilTs) {
  const store = getStore({ name: "gucut-orders", consistency: "strong" });
  let blobs = [];
  try { ({ blobs } = await store.list({ prefix: "o/" })); } catch { return null; }

  const byDay = new Map();
  let orders = 0, revenue = 0, pending = 0;

  for (const b of blobs) {
    const o = await store.get(b.key, { type: "json" }).catch(() => null);
    if (!o || typeof o.at !== "number") continue;
    if (o.at < sinceTs || o.at > untilTs) continue;
    if (o.status === "cancelled") continue;
    if (o.status === "pending") { pending += 1; continue; }

    const total = Number(o.total) || 0;
    orders += 1;
    revenue += total;
    const d = ymd(o.at);
    const cur = byDay.get(d) || { orders: 0, revenue: 0 };
    cur.orders += 1;
    cur.revenue += total;
    byDay.set(d, cur);
  }

  return {
    orders,
    revenue,
    pending,
    days: [...byDay.entries()].sort().map(([date, v]) => ({ date, ...v })),
  };
}

export default async function handler(req, context) {
  const url = new URL(req.url);

  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const saved = await saveConfig(body);
    return json({ ok: true, ...publicView(saved) });
  }

  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const cfg = await readConfig();

  if (url.searchParams.get("report") !== "1") return json(publicView(cfg));

  // ช่วงวันที่ — นับรวมวันนี้ด้วย (days=7 คือ 7 วันย้อนหลังถึงเมื่อคืน + วันนี้)
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 7));
  const now = new Date();
  const untilTs = now.getTime();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  const sinceTs = start.getTime();

  const [fb, sales] = await Promise.all([
    cfg.fb.on && cfg.fb.token && cfg.fb.accountId
      ? facebookInsights({
          accountId: cfg.fb.accountId,
          token: cfg.fb.token,
          since: ymd(sinceTs),
          until: ymd(untilTs),
        }).then(
          (rows) => ({ ok: true, rows }),
          // ⚠️ พังฝั่ง Facebook ต้องไม่ทำให้ทั้งหน้าพัง — ยอดขายของเรายังต้องดูได้
          (e) => ({ ok: false, error: String(e?.message || e), rows: [] }),
        )
      : Promise.resolve({ ok: false, off: true, rows: [] }),
    ownSales(sinceTs, untilTs),
  ]);

  const spend = fb.rows.reduce((s, r) => s + r.spend, 0);

  return json({
    range: { since: ymd(sinceTs), until: ymd(untilTs), days },
    fb,
    sales,
    // "ได้เงินกี่บาทต่อค่าโฆษณา 1 บาท" คิดจากยอดขายจริงของเรา ไม่ใช่ที่พิกเซลเดา
    roas: spend > 0 && sales ? sales.revenue / spend : null,
    spend,
  });
}

export const config = { path: "/api/ad-stats" };
