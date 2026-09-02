// GUCUT Core — ประตูสั่งงาน/ดูสถานะคลังเงา (หลังร้านเท่านั้น)
//
//   GET /api/core                 สถานะ: จำนวนแถว · เทียบยอดล่าสุด · ช่องทางที่เห็น
//   GET /api/core?sync=1&days=30  กระจกย้อนหลัง N วัน (backfill · สูงสุด 60)
//   GET /api/core?recon=1         สั่งเทียบยอดเมื่อวานเดี๋ยวนี้
//   GET /api/core?snapshot=1      สั่งถ่ายสต็อกเดี๋ยวนี้
//   GET /api/core?stock=1&days=N  เทียบสต็อกที่เราคำนวณเองกับ ZORT (ไม่จด · ดูเฉย ๆ)
import { adminGate } from "../lib/admin-gate.mjs";
import { coreQuery, coreReady, coreInit } from "../lib/coredb.mjs";
import { syncOrders, reconYesterday, snapshotStock } from "../lib/core-sync.mjs";
import { syncShopeeOrders, shopeeRecon } from "../lib/shopee-orders.mjs";
import { shopeeStockCompare, shopeeMissingSkus } from "../lib/shopee-stock.mjs";
import { applyMoves, listMoves, deleteMove } from "../lib/stock-moves.mjs";
import { peakStatus, toInvoice, sendInvoices } from "../lib/peak.mjs";
import { stockRecon, stockReconLog, listStock } from "../lib/core-stock.mjs";
import { listOrders, getOrder, listChannels } from "../lib/core-orders.mjs";

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

    // ของเข้า-ของออกที่ไม่ได้มาจากออเดอร์ (รับของ · โอน · ของเสีย · ปรับจากการนับ)
    //   POST /api/core?move=1   body: {sku,qty,reason,ref} หรือ {moves:[...]}
    //   GET  /api/core?list=moves&sku=&limit=&offset=
    if (url.searchParams.get("movedel")) {
      if (req.method !== "DELETE") return json({ error: "ต้องเป็น DELETE" }, 405);
      const r = await deleteMove(url.searchParams.get("movedel"));
      return json(r.error ? { ok: false, ...r } : { ok: true, ...r }, r.error ? 400 : 200);
    }
    if (url.searchParams.get("move")) {
      if (req.method !== "POST") return json({ error: "ต้องเป็น POST" }, 405);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "อ่าน body ไม่ได้ (ต้องเป็น JSON)" }, 400);
      const moves = Array.isArray(body) ? body : body.moves ?? [body];
      const r = await applyMoves(moves);
      return json(r.error ? { ok: false, ...r } : { ok: true, ...r }, r.error ? 400 : 200);
    }
    // SKU ที่ Shopee ขายอยู่แต่คลังเราไม่รู้จัก (พร้อมเดารหัสฐานให้) — ให้จอเตือนเอาไปโชว์
    if (url.searchParams.get("list") === "missing-sku") {
      return json({ ok: true, ...(await shopeeMissingSkus()) });
    }
    // สินค้าขายดีรวมยอดฝั่งเซิร์ฟเวอร์ — จอ /sales ใช้เติมช่อง "ยอดเงิน" (ขอโดยฝั่งจอ 2 ก.ย.)
    //   GET /api/core?list=topproducts&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=15
    //   ยอดเงินรวมจาก order_items จริง ไม่ใช่ qty×ราคาขาย (อันนั้นเป็นการเดา)
    if (url.searchParams.get("list") === "topproducts") {
      const day = (s, fallback) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : fallback);
      const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      const monthAgo = new Date(Date.now() + 7 * 3600 * 1000 - 30 * 86400 * 1000)
        .toISOString().slice(0, 10);
      const from = day(url.searchParams.get("from"), monthAgo);
      const to = day(url.searchParams.get("to"), today);
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "15", 10) || 15));
      const items = await coreQuery(
        `SELECT oi.sku, MAX(oi.name) AS name,
                SUM(oi.qty) AS qty, ROUND(COALESCE(SUM(oi.amount),0),2) AS amount
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.order_date >= ? AND o.order_date <= ?
           AND o.status NOT LIKE '%cancel%' AND o.status NOT LIKE '%void%' AND o.status NOT LIKE '%ยกเลิก%'
         GROUP BY oi.sku ORDER BY qty DESC LIMIT ${limit}`,
        [from, to]
      );
      return json({ ok: true, from, to, items });
    }
    // สะพานส่งเอกสารขายเข้า PEAK (แทนหน้าที่ ZORT)
    //   GET /api/core?peak=status            ต่อ PEAK ได้ไหม (ไม่สร้างเอกสารอะไร)
    //   GET /api/core?peak=dry&day=YYYY-MM-DD  ซ้อมแปลงออเดอร์วันนั้นเป็นใบแจ้งหนี้ ไม่ส่งจริง
    // ⚠️ ยังไม่มีทางส่งจริงผ่าน URL โดยตั้งใจ — ต้องตั้ง PEAK_LIVE แล้วเพิ่มตัวสั่งอีกชั้น
    //    เอกสารขายผูกกับบัญชีและภาษี ยิงผิดต้องตามยกเลิกทีละใบ
    if (url.searchParams.get("peak")) {
      const mode = url.searchParams.get("peak");
      if (mode === "status") return json({ ok: true, peak: await peakStatus() });
      if (mode === "dry") {
        const day = url.searchParams.get("day") ||
          new Date(Date.now() + 7 * 3600 * 1000 - 86400 * 1000).toISOString().slice(0, 10);
        const orders = await coreQuery(
          `SELECT id, number, channel, customer, order_date, amount FROM orders
           WHERE order_date = ? AND status NOT LIKE '%cancel%' AND status NOT LIKE '%void%'
             AND status NOT LIKE '%ยกเลิก%' LIMIT 200`,
          [day]
        );
        const items = await coreQuery(
          `SELECT oi.order_id, oi.sku, oi.name, oi.qty, oi.amount
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE o.order_date = ?`,
          [day]
        );
        const byOrder = new Map();
        for (const it of items) {
          if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
          byOrder.get(it.order_id).push(it);
        }
        const invoices = orders.map((o) => toInvoice(o, byOrder.get(o.id) ?? []));
        return json({ ok: true, day, orders: orders.length, peak: await sendInvoices(invoices) });
      }
      return json({ error: "peak รับได้เฉพาะ status หรือ dry" }, 400);
    }
    if (url.searchParams.get("list") === "moves") {
      return json({
        ok: true,
        ...(await listMoves({
          sku: url.searchParams.get("sku") ?? "",
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
        })),
      });
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
    // เทียบสต็อกบน Shopee กับคลังเรา — อ่านอย่างเดียว ไม่เขียนกลับ Shopee
    if (url.searchParams.get("stockcompare")) {
      return json({ ok: true, stock: await shopeeStockCompare() });
    }
    if (url.searchParams.get("snapshot")) {
      return json({ ok: true, snapshot: await snapshotStock() });
    }
    if (url.searchParams.get("stock")) {
      const days = parseInt(url.searchParams.get("days") ?? "1", 10) || 1;
      return json({ ok: true, stock: await stockRecon(days, 60) });
    }

    // ── จอ "รายการขาย" ที่ยืนได้เองโดยไม่มี ZORT ──
    const p = url.searchParams;
    if (p.get("order")) {
      return json({ ok: true, ...(await getOrder(p.get("order"))) });
    }
    if (p.get("list") === "stock") {
      return json({
        ok: true,
        ...(await listStock({
          q: p.get("q"),
          sort: p.get("sort"),
          limit: p.get("limit"),
          offset: p.get("offset"),
          soldDays: p.get("soldDays"),
        })),
      });
    }
    if (p.get("list") === "orders") {
      return json({
        ok: true,
        ...(await listOrders({
          from: p.get("from"),
          to: p.get("to"),
          channel: p.get("channel"),
          status: p.get("status"),
          q: p.get("q"),
          limit: p.get("limit"),
          offset: p.get("offset"),
          includeCancelled: p.get("cancelled") === "1",
        })),
        channels: await listChannels(),
      });
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
    // สมุดเทียบสต็อก (แผนลับขั้น 1) — ตารางยังไม่ได้สร้าง = ส่ง [] ไม่ล้มทั้งหน้า
    const stock = await stockReconLog(14).catch(() => []);
    return json({ ready: true, counts, recon, channels, shopee, stock });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
}

export const config = { path: "/api/core" };
