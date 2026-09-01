// GUCUT Core — ประตูสั่งงาน/ดูสถานะคลังเงา (หลังร้านเท่านั้น)
//
//   GET /api/core                 สถานะ: จำนวนแถว · เทียบยอดล่าสุด · ช่องทางที่เห็น
//   GET /api/core?sync=1&days=30  กระจกย้อนหลัง N วัน (backfill · สูงสุด 60)
//   GET /api/core?recon=1         สั่งเทียบยอดเมื่อวานเดี๋ยวนี้
//   GET /api/core?snapshot=1      สั่งถ่ายสต็อกเดี๋ยวนี้
import { adminGate } from "../lib/admin-gate.mjs";
import { coreQuery, coreReady, coreInit } from "../lib/coredb.mjs";
import { syncOrders, reconYesterday, snapshotStock } from "../lib/core-sync.mjs";
import { syncShopeeOrders, shopeeRecon } from "../lib/shopee-orders.mjs";

export default async function handler(req, context) {
  // adminGate คืน { wants, ok, deny } ไม่ใช่ Response — ต้องเช็คสองชั้น (บทเรียน 25 ส.ค.)
  // และ "ไม่ส่งรหัสมาเลย" gate จะไม่ deny ให้เอง (wants:false) — API หลังร้านล้วน
  // แบบตัวนี้ต้องบังคับ ok เท่านั้น (เจอจริงตอนยิงทดสอบ 30 ส.ค. — ไม่มีรหัสได้ 200)
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

  try {
    if (!coreReady()) {
      return json({ ready: false, note: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN ที่ Netlify" });
    }

    if (url.searchParams.get("init")) {
      return json({ ok: true, init: await coreInit() });
    }
    if (url.searchParams.get("sync")) {
      const days = Math.min(60, Math.max(1, parseInt(url.searchParams.get("days") ?? "3", 10) || 3));
      return json({ ok: true, sync: await syncOrders(days) });
    }
    if (url.searchParams.get("recon")) {
      return json({ ok: true, recon: await reconYesterday() });
    }
    if (url.searchParams.get("shopeesync")) {
      const days = Math.min(15, Math.max(1, parseInt(url.searchParams.get("days") ?? "3", 10) || 3));
      return json({ ok: true, shopee: await syncShopeeOrders(days) });
    }
    if (url.searchParams.get("snapshot")) {
      return json({ ok: true, snapshot: await snapshotStock() });
    }

    // สถานะรวม
    const [counts] = await coreQuery(
      `SELECT (SELECT COUNT(*) FROM orders) AS orders,
              (SELECT COUNT(*) FROM order_items) AS items,
              (SELECT COUNT(*) FROM stock_snapshots) AS snapshots`
    );
    const recon = await coreQuery(`SELECT * FROM recon_log ORDER BY day DESC LIMIT 7`);
    const channels = await coreQuery(
      `SELECT channel, COUNT(*) AS orders, ROUND(COALESCE(SUM(amount),0),2) AS amount
       FROM orders GROUP BY channel ORDER BY amount DESC LIMIT 20`
    );
    // เทียบ 3 ทางฝั่ง Shopee (แผนลับขั้น 3 — ระยะรันคู่) · ตารางยังไม่มี = ส่ง [] เฉย ๆ
    const shopee = await shopeeRecon(7).catch(() => []);
    return json({ ready: true, counts, recon, channels, shopee });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

export const config = { path: "/api/core" };
