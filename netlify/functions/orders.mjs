// ระบบออเดอร์ — /api/orders
// เก็บออเดอร์ไว้ที่ Netlify Blobs (ของ Netlify เอง ไม่ต้องต่อบริการอื่น)
// แล้วเด้งแจ้งเตือนเข้ากลุ่ม Telegram เดิมของร้าน (กลุ่มเดียวกับแชท)
//
// ฝั่งลูกค้า
//   POST /api/orders                    ส่งออเดอร์ (จากหน้าสั่งซื้อ)
// ฝั่งร้าน (ต้องมี key — ผ่านด่าน admin-gate เหมือน API หลังร้านทุกตัว)
//   GET   /api/orders                   รายการออเดอร์ (ข้อมูลย่อ ไม่รวมสลิป)
//   GET   /api/orders?id=xxx            ดูออเดอร์เต็ม + สลิป
//   GET   /api/orders?stat=1            นับออเดอร์ใหม่ (ใช้ทำ badge)
//   PATCH /api/orders  {id, status}     เปลี่ยนสถานะ
//
// วิธีเก็บ — แยกสลิปออกจากตัวออเดอร์
//   o/<id>     ตัวออเดอร์ (เล็ก)  → หน้ารายการโหลดเร็ว ไม่ต้องแบกสลิปทุกใบ
//   slip/<id>  รูปสลิป base64     → โหลดเฉพาะตอนกดเปิดดูใบนั้น
//
// env เสริม (มีอยู่แล้วจากระบบแชท ไม่ต้องตั้งใหม่)
//   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID   เด้งออเดอร์เข้ากลุ่ม
//   ORDER_FORWARD_URL   (ไม่บังคับ) ส่งต่อออเดอร์ไปที่อื่นอีกทาง เช่น Make.com
import { getStore } from "@netlify/blobs";
import { pushToAdmins } from "../lib/push.mjs";
import { adminGate } from "../lib/admin-gate.mjs";

// สถานะที่ยอมรับ — ตามขั้นตอนงานจริงของร้าน
export const STATUSES = ["new", "confirmed", "shipped", "done", "cancelled"];

const MAX_ORDERS_PER_WINDOW = 10;     // กันสแปม: ออเดอร์ต่อ IP
const WINDOW_MS = 10 * 60 * 1000;     // ในช่วงเวลาเท่านี้
const MAX_ITEMS = 60;
const MAX_SLIP = 4 * 1024 * 1024;     // base64 ~3MB ไฟล์จริง

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const money = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);

const who = (req, context) =>
  context?.ip ||
  req.headers.get("x-nf-client-connection-ip") ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

export default async function handler(req, context) {
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  const asAdmin = gate.ok;

  let store;
  try {
    store = getStore({ name: "gucut-orders", consistency: "strong" });
  } catch {
    return json({ error: "order store unavailable" }, 503);
  }

  const url = new URL(req.url);

  // ---------- ลูกค้าส่งออเดอร์ ----------
  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

    // กันสแปม — นับแยกตาม IP (Blobs ล่มก็ปล่อยผ่าน รับออเดอร์สำคัญกว่า)
    const ip = who(req, context);
    const now = Date.now();
    const rl = (await store.get(`rl/${ip}`, { type: "json" }).catch(() => null)) || { n: 0, start: now };
    if (now - rl.start > WINDOW_MS) { rl.n = 0; rl.start = now; }
    if (rl.n >= MAX_ORDERS_PER_WINDOW) {
      return json({ error: "สั่งซื้อถี่เกินไป รอสักครู่แล้วลองใหม่" }, 429);
    }

    // ตรวจของที่ต้องมี — เลขเงินคิดใหม่ฝั่งนี้ ไม่เชื่อยอดที่เบราว์เซอร์ส่งมาทั้งดุ้น
    const c = body.customer || {};
    const customer = {
      name: clean(c.name, 80),
      phone: clean(c.phone, 20),
      address: clean(c.address, 300),
      province: clean(c.province, 60),
      zip: clean(c.zip, 10),
      note: clean(c.note, 500),
    };
    if (!customer.name || !/^0\d{8,9}$/.test(customer.phone.replace(/\D/g, "")) || !customer.address) {
      return json({ error: "ข้อมูลผู้รับไม่ครบ" }, 400);
    }
    const items = (Array.isArray(body.items) ? body.items : [])
      .slice(0, MAX_ITEMS)
      .map((i) => ({
        title: clean(i.title, 160),
        variant: clean(i.variant, 80),
        price: money(i.price),
        qty: Math.min(999, Math.max(1, money(i.qty))),
      }))
      .filter((i) => i.title && i.price > 0);
    if (!items.length) return json({ error: "ไม่มีสินค้าในออเดอร์" }, 400);

    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const shipping = money(body.shipping);
    const codFee = money(body.codFee);
    // ส่วนลดรับตามที่แจ้ง แต่ไม่ให้เกินค่าสินค้า — โค้ดถูกตรวจกับ /api/coupon ไปแล้ว
    const discount = Math.min(money(body.discount), subtotal);
    const total = Math.max(0, subtotal - discount) + shipping + codFee;

    const payment = body.payment === "promptpay" ? "promptpay" : "cod";
    const slip = typeof body.slipBase64 === "string" && body.slipBase64.startsWith("data:image/")
      ? body.slipBase64.slice(0, MAX_SLIP)
      : null;
    if (payment === "promptpay" && !slip) return json({ error: "ยังไม่ได้แนบสลิป" }, 400);

    const id = "GC" + Date.now().toString(36).toUpperCase() +
      Math.random().toString(36).slice(2, 5).toUpperCase();

    const order = {
      id,
      at: Date.now(),
      status: "new",
      customer,
      items,
      payment,
      paymentLabel: payment === "cod" ? "เก็บเงินปลายทาง" : "QR พร้อมเพย์",
      couponCode: clean(body.couponCode, 40) || null,
      discount,
      subtotal,
      shipping,
      codFee,
      total,
      taxInvoice: body.taxInvoice
        ? {
            name: clean(body.taxInvoice.name, 120),
            taxId: clean(body.taxInvoice.taxId, 17),
            address: clean(body.taxInvoice.address, 300),
          }
        : null,
      hasSlip: !!slip,
    };

    await store.setJSON(`o/${id}`, order);
    if (slip) await store.set(`slip/${id}`, slip);
    rl.n += 1;
    await store.setJSON(`rl/${ip}`, rl).catch(() => {});

    // แจ้งเตือนร้าน — ต้องรอให้ยิงเสร็จก่อนตอบ ไม่งั้น serverless ดับก่อนแล้วเงียบหาย
    const jobs = [];
    const later = (p) => (context?.waitUntil ? context.waitUntil(p) : jobs.push(p));

    const lines = items
      .map((i) => `· ${i.title}${i.variant && i.variant !== "-" ? ` (${i.variant})` : ""} ×${i.qty} = ฿${(i.price * i.qty).toLocaleString("th-TH")}`)
      .join("\n");
    const text =
      `🛒 ออเดอร์ใหม่ #${id}\n` +
      `${customer.name} · ${customer.phone}\n\n${lines}\n` +
      (discount ? `ส่วนลด (${order.couponCode}) -฿${discount.toLocaleString("th-TH")}\n` : "") +
      `รวม ฿${total.toLocaleString("th-TH")} · ${order.paymentLabel}${order.hasSlip ? " (แนบสลิปแล้ว)" : ""}\n` +
      (order.taxInvoice ? `🧾 ขอใบกำกับภาษี: ${order.taxInvoice.name}\n` : "") +
      `📍 ${customer.address} ${customer.province} ${customer.zip}\n` +
      (customer.note ? `📝 ${customer.note}\n` : "") +
      `\nเปิดดู: https://new78.com/admin/orders/`;

    const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      later(
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
        }).catch(() => {})
      );
    }
    later(
      pushToAdmins({
        title: `🛒 ออเดอร์ใหม่ ฿${total.toLocaleString("th-TH")}`,
        body: `${customer.name} · ${order.paymentLabel}`,
        url: "/admin/orders/",
        tag: id,
      }).catch(() => {})
    );
    if (process.env.ORDER_FORWARD_URL) {
      later(
        fetch(process.env.ORDER_FORWARD_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...order, slipBase64: slip }),
        }).catch(() => {})
      );
    }
    if (jobs.length) await Promise.allSettled(jobs);

    return json({ ok: true, orderId: id });
  }

  // ---------- ฝั่งร้าน ----------
  if (!asAdmin) return json({ error: "unauthorized" }, 401);

  if (req.method === "GET") {
    const id = clean(url.searchParams.get("id") || "", 40);

    // ดูใบเดียวเต็ม ๆ + สลิป
    if (id) {
      const o = await store.get(`o/${id}`, { type: "json" }).catch(() => null);
      if (!o) return json({ error: "not found" }, 404);
      const slip = o.hasSlip ? await store.get(`slip/${id}`).catch(() => null) : null;
      return json({ order: o, slip });
    }

    // รายการทั้งหมด (ใหม่สุดก่อน) — ตัวออเดอร์เล็กอยู่แล้วเพราะแยกสลิปไว้ต่างหาก
    const { blobs } = await store.list({ prefix: "o/" });
    const orders = [];
    for (const b of blobs) {
      const o = await store.get(b.key, { type: "json" }).catch(() => null);
      if (o) orders.push(o);
    }
    orders.sort((a, b) => b.at - a.at);

    if (url.searchParams.get("stat") === "1") {
      return json({ newCount: orders.filter((o) => o.status === "new").length });
    }
    return json({ orders });
  }

  if (req.method === "PATCH") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const id = clean(body.id, 40);
    const status = clean(body.status, 20);
    if (!STATUSES.includes(status)) return json({ error: "bad status" }, 400);
    const o = await store.get(`o/${id}`, { type: "json" }).catch(() => null);
    if (!o) return json({ error: "not found" }, 404);
    o.status = status;
    o.statusAt = Date.now();
    await store.setJSON(`o/${id}`, o);
    return json({ ok: true, order: o });
  }

  return json({ error: "method not allowed" }, 405);
}

export const config = { path: "/api/orders" };
