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
import { currentUser, normPhone, store as usersStore } from "../lib/session.mjs";
import { markUsed } from "../lib/coupons.mjs";
import { addPoints, earnFrom, readLoyalty, redeemPlan } from "../lib/points.mjs";
import { SITE_HOST, SITE_URL } from "../lib/site.mjs";
import { shippingFor } from "../lib/shipping.mjs";
import { sendPurchase } from "../lib/marketing.mjs";
import { finalizeOrder } from "../lib/order-finalize.mjs";
import { beamReady, chargePaid, createQrCharge, getCharge } from "../lib/beam.mjs";

// สถานะที่ยอมรับ — ตามขั้นตอนงานจริงของร้าน
// ⚠️ "ยกเลิก" กับ "คืนของ" ต้องแยกกัน ห้ามยุบเป็นอันเดียว
//    ยกเลิกก่อนส่ง = ไม่เสียอะไรเลย · คืนของหลังส่ง = เสียค่าส่งสองขา + ค่ากล่อง + เวลาแพ็ค
//    ถ้านับรวมกัน ตัวเลข "สินค้าที่ถูกคืน" จะบวมจนเอาไปตัดสินใจอะไรไม่ได้
export const STATUSES = ["pending", "new", "confirmed", "shipped", "done", "cancelled", "returned"];

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
        sku: clean(i.sku, 64),
        price: money(i.price),
        qty: Math.min(999, Math.max(1, money(i.qty))),
      }))
      .filter((i) => i.title && i.price > 0);
    if (!items.length) return json({ error: "ไม่มีสินค้าในออเดอร์" }, 400);

    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const codFee = money(body.codFee);
    // ส่วนลดรับตามที่แจ้ง แต่ไม่ให้เกินค่าสินค้า — โค้ดถูกตรวจกับ /api/coupon ไปแล้ว
    const discount = Math.min(money(body.discount), subtotal);

    // ค่าส่ง — คิดใหม่จากตารางเสมอ ห้ามเชื่อ body.shipping
    // (เดิมรับค่าจากเบราว์เซอร์ตรง ๆ ตอนค่าส่งเป็น 0 เสมอจึงไม่มีผล
    //  แต่พอมีค่าส่งจริงแล้ว ใครแก้ค่าที่ส่งมาเป็น 0 ก็จะได้ส่งฟรี)
    const shipping = shippingFor(Math.max(0, subtotal - discount));

    // แลกแต้มสะสม — คิดฝั่งเซิร์ฟเวอร์เสมอ ไม่เชื่อตัวเลขจากเบราว์เซอร์
    // ต้องล็อกอินอยู่จริงถึงแลกได้ (แต้มผูกกับบัญชี)
    const cfg = await readLoyalty();
    const buyer = await currentUser(req, usersStore()).then((r) => r?.user ?? null).catch(() => null);
    const plan = buyer
      ? redeemPlan(body.usePoints, Number(buyer.points || 0), Math.max(0, subtotal - discount), cfg)
      : { points: 0, discount: 0 };
    const pointDiscount = plan.discount || 0;

    const total = Math.max(0, subtotal - discount - pointDiscount) + shipping + codFee;

    // เก็บเงินปลายทาง — ปิด/เปิดด้วย NEXT_PUBLIC_COD ตัวเดียวกับหน้าเว็บ
    // ปิดที่หน้าเว็บอย่างเดียวไม่พอ ยิง POST ตรงมาก็สั่งแบบ COD ได้
    const codOn = process.env.NEXT_PUBLIC_COD === "1";
    const payment = ["beam", "promptpay", "cod"].includes(body.payment) ? body.payment : "cod";
    if (payment === "cod" && !codOn) {
      return json({ error: "ตอนนี้ยังไม่เปิดให้เก็บเงินปลายทาง กรุณาชำระด้วย QR พร้อมเพย์" }, 400);
    }
    if (payment === "beam" && !beamReady()) {
      return json({ error: "ระบบรับชำระเงินยังไม่พร้อม กรุณาทักแชทร้าน" }, 503);
    }
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
      pointDiscount,
      couponCode: clean(body.couponCode, 40) || null,
      discount,
      pointsUsed: plan.points || 0,
      pointDiscount,
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

    // -----------------------------------------------------------------------
    // จ่ายผ่าน Beam — ยังไม่ใช่ออเดอร์จริงจนกว่าเงินจะเข้า
    //
    // ⚠️ ห้ามส่งเข้า ZORT ตรงนี้เด็ดขาด ลูกน้องแพ็คของจาก ZORT
    //    ถ้าส่งไปตั้งแต่ตอนกดสั่ง จะมีคนแพ็คของให้ลูกค้าที่ยังไม่จ่าย
    //    งานทั้งหมด (ZORT · Telegram · ตัดแต้ม · นับโควตาโค้ด · ยอดโฆษณา)
    //    ถูกยกไปไว้ที่ finalizeOrder แล้วเรียกตอนยืนยันว่าเงินเข้าจริงเท่านั้น
    // -----------------------------------------------------------------------
    if (payment === "beam") {
      order.status = "pending";
      order.paid = false;
      // รหัสสั้น ๆ ให้หน้าเว็บใช้ถามสถานะออเดอร์ใบนี้ได้โดยไม่ต้องล็อกอิน
      order.checkToken = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

      let charge;
      try {
        charge = await createQrCharge({
          orderId: id,
          baht: total,
          returnUrl: `${SITE_URL}/account/orders/`,
        });
      } catch (e) {
        return json({ error: `ขอ QR ไม่สำเร็จ: ${String(e?.message || e).slice(0, 120)}` }, 502);
      }

      order.beam = { chargeId: charge.chargeId, expiry: charge.expiry };
      await store.setJSON(`o/${id}`, order);
      rl.n += 1;
      await store.setJSON(`rl/${ip}`, rl).catch(() => {});

      return json({
        ok: true, orderId: id, pay: "beam",
        checkToken: order.checkToken,
        qrBase64: charge.qrBase64,
        expiry: charge.expiry,
        total,
      });
    }

    // เก็บเงินปลายทาง / โอนแล้วแนบสลิป — ถือว่าใช้ได้ทันที
    if (slip) await store.set(`slip/${id}`, slip);
    await finalizeOrder({
      order, store, usersStore, buyer, slip, req, context, zortAddOrder,
    });
    rl.n += 1;
    await store.setJSON(`rl/${ip}`, rl).catch(() => {});

    return json({ ok: true, orderId: id });
  }

  // ---------- ลูกค้า: ถามว่าจ่ายเงินสำเร็จหรือยัง ----------
  //
  // ต้องมีทั้งเลขออเดอร์และรหัสประจำใบ (checkToken) ถึงจะดูได้
  // เดาเลขออเดอร์อย่างเดียวไม่พอ และไม่ส่งข้อมูลลูกค้ากลับไปเลยนอกจากสถานะ
  //
  // ⚠️ ตรงนี้ "ถาม Beam เอง" ด้วย ไม่ได้รอแต่ webhook อย่างเดียว
  //    ถ้า webhook หายไป (เน็ตสะดุด / Beam ยิงพลาด) ลูกค้าที่จ่ายแล้วจะค้างอยู่หน้าจอ
  //    ทางนี้ทำให้จ่ายแล้วรู้ผลเสมอ ตราบใดที่ลูกค้ายังเปิดหน้าอยู่
  if (req.method === "GET" && url.searchParams.get("t")) {
    const oid = (url.searchParams.get("id") || "").trim();
    const tok = (url.searchParams.get("t") || "").trim();
    const o = oid ? await store.get(`o/${oid}`, { type: "json" }).catch(() => null) : null;
    if (!o || !o.checkToken || o.checkToken !== tok) return json({ error: "not found" }, 404);

    if (!o.paid && o.beam?.chargeId) {
      try {
        const c = await getCharge(o.beam.chargeId);
        if (chargePaid(c)) await markOrderPaid(o, store, req, context);
      } catch { /* ถาม Beam ไม่ได้ตอนนี้ก็ตอบสถานะเดิมไปก่อน */ }
    }
    return json({ paid: !!o.paid, status: o.status, expiry: o.beam?.expiry ?? null });
  }

  // ---------- ลูกค้า: การซื้อของฉัน ----------
  // จับคู่ด้วยเบอร์โทรของบัญชีที่ล็อกอิน กับเบอร์ผู้รับในออเดอร์
  // (ไม่ส่งสลิปกลับไป — หน้าลูกค้าไม่ต้องใช้ และกันข้อมูลรั่วเกินจำเป็น)
  if (req.method === "GET" && url.searchParams.get("mine") === "1") {
    let me = null;
    try { me = await currentUser(req, usersStore()); } catch { /* ถือว่าไม่ได้ล็อกอิน */ }
    if (!me) return json({ error: "login" }, 401);
    const myPhone = normPhone(me.user.phone);

    const { blobs } = await store.list({ prefix: "o/" });
    const mine = [];
    for (const b of blobs) {
      const o = await store.get(b.key, { type: "json" }).catch(() => null);
      if (!o || normPhone(o.customer?.phone) !== myPhone) continue;
      mine.push({
        id: o.id, at: o.at, status: o.status,
        items: o.items, paymentLabel: o.paymentLabel,
        discount: o.discount, shipping: o.shipping, codFee: o.codFee, total: o.total,
      });
    }
    mine.sort((a, b) => b.at - a.at);
    return json({ orders: mine });
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

    // ส่งเข้า ZORT ซ้ำ — ใช้ตอนรอบแรกพัง (เช่น ZORT ล่มพอดี)
    if (body.action === "zort") {
      const o = await store.get(`o/${id}`, { type: "json" }).catch(() => null);
      if (!o) return json({ error: "not found" }, 404);
      o.zort = await zortAddOrder(o);
      // จดเวลาที่เปลี่ยนเป็น "คืนของ" ไว้ด้วย — รายงานต้องนับตามวันที่คืน ไม่ใช่วันที่สั่ง
      if (status === "returned" && !o.returnedAt) o.returnedAt = Date.now();
      await store.setJSON(`o/${id}`, o);
      return json({ ok: o.zort.ok, order: o });
    }

    const status = clean(body.status, 20);
    if (!STATUSES.includes(status)) return json({ error: "bad status" }, 400);
    const o = await store.get(`o/${id}`, { type: "json" }).catch(() => null);
    if (!o) return json({ error: "not found" }, 404);
    o.status = status;
    o.statusAt = Date.now();

    // ออเดอร์ถึงมือลูกค้าแล้วค่อยให้แต้ม — ไม่ให้ตอนสั่ง เพราะยกเลิก/คืนของได้
    // ให้ครั้งเดียวต่อออเดอร์ (ธง pointsGiven) ต่อให้กดสถานะสลับไปมาก็ไม่ได้ซ้ำ
    if (status === "done" && !o.pointsGiven) {
      const cfg = await readLoyalty();
      const gain = earnFrom(o.subtotal ?? 0, cfg);
      if (gain > 0) {
        const phone = normPhone(o.customer?.phone);
        const after = await addPoints(usersStore(), phone, gain, `ได้จากออเดอร์ ${o.id}`, o.id).catch(() => null);
        if (after !== null) { o.pointsGiven = gain; o.pointsAt = Date.now(); }
      }
    }

    await store.setJSON(`o/${id}`, o);
    return json({ ok: true, order: o });
  }

  return json({ error: "method not allowed" }, 405);
}

// ชื่อที่จะไปโชว์ในหน้า "รายการขาย" ของ ZORT — แก้ที่นี่ หรือทับด้วย env ก็ได้
// ต้องสะกดตรงกับช่องทาง/ขนส่งที่ตั้งไว้ใน ZORT เป๊ะ ๆ ไม่งั้น ZORT ไม่รู้จักแล้วปล่อยว่าง
const SALES_CHANNEL = process.env.ZORT_SALES_CHANNEL || "gucut";
const SHIPPING_CHANNEL = process.env.ZORT_SHIPPING_CHANNEL || "Flash Express";
const PAYMENT_METHOD = process.env.ZORT_PAYMENT_METHOD || "เงินโอน";

// ZORT รับเวลาชำระเป็น "yyyy-MM-dd HH:mm" ตามเวลาไทย — เซิร์ฟเวอร์รันด้วย UTC
// จึงต้องบวก 7 ชั่วโมงเอง ไม่งั้นเวลาชำระจะเพี้ยนไป 7 ชม. ทุกใบ
const thaiDateTime = (ms) =>
  new Date(ms + 7 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 16);

// ---------------------------------------------------------------------------
// ส่งออเดอร์เข้า ZORT (open-api.zortout.com) — ใช้รหัสชุดเดียวกับ /api/stock
// ZORT จับคู่สินค้าด้วย SKU แล้วตัดสต็อกให้เอง เหมือนตอนออเดอร์มาจาก Shopify
// รายการที่ไม่มี SKU (ของเก่าในตะกร้าลูกค้า) ส่งเป็นชื่อเฉย ๆ ร้านไปจับคู่เองใน ZORT
// ---------------------------------------------------------------------------
async function zortAddOrder(order) {
  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME || !ZORT_APIKEY || !ZORT_APISECRET) {
    return { ok: false, skipped: true, message: "ยังไม่ได้ตั้งค่า ZORT" };
  }
  const cod = order.payment === "cod";
  const body = {
    number: order.id,                                   // เลขเดียวกับบนเว็บ ตามกันเจอ
    orderdate: new Date(order.at).toISOString().slice(0, 10),
    customername: order.customer.name,
    customerphone: order.customer.phone,
    customeraddress:
      `${order.customer.address} ${order.customer.province} ${order.customer.zip}`.trim(),
    description:
      `จากเว็บ ${SITE_HOST} · ${order.paymentLabel}` +
      (order.couponCode ? ` · โค้ด ${order.couponCode}` : "") +
      (order.customer.note ? ` · ${order.customer.note}` : ""),
    discountamount: order.discount || 0,
    shippingamount: order.shipping || 0,
    amount: order.total,
    // ช่องทางการขาย — โชว์ในคอลัมน์ "ช่องทาง" แบบเดียวกับ Shopee / Lazada / Shopify
    // ⚠️ ต้องมีช่องทางชื่อนี้อยู่ใน ZORT (ตั้งค่า → ช่องทางการขาย) ไม่งั้นคอลัมน์จะว่าง
    saleschannel: SALES_CHANNEL,
    // ป้าย COD ในคอลัมน์ "วันส่งสินค้า" — ออเดอร์เก็บเงินปลายทางต้องมีป้ายนี้
    isCOD: cod,
    shippingchannel: SHIPPING_CHANNEL,       // คอลัมน์ "บริการขนส่ง"
    // จ่ายด้วย QR = โอนแล้ว (มีสลิป) · เก็บปลายทาง = ยังไม่จ่าย
    paymentamount: cod ? 0 : order.total,
    // ZORT บังคับให้ระบุวิธีชำระเมื่อส่งยอดที่ชำระมาด้วย
    ...(cod ? {} : { paymentmethod: PAYMENT_METHOD, paymentdate: thaiDateTime(order.at) }),
    list: order.items.map((i) => ({
      ...(i.sku ? { sku: i.sku } : {}),
      name: i.title + (i.variant && i.variant !== "-" ? ` (${i.variant})` : ""),
      number: i.qty,
      pricepernumber: i.price,
    })),
  };
  try {
    const res = await fetch("https://open-api.zortout.com/v4/Order/AddOrder", {
      method: "POST",
      headers: {
        storename: ZORT_STORENAME,
        apikey: ZORT_APIKEY,
        apisecret: ZORT_APISECRET,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(9000),
    });
    const j = await res.json().catch(() => ({}));
    // ZORT ตอบรหัสไว้คนละที่แล้วแต่รุ่น — เช็คให้ครบทั้งสองแบบ
    const code = String(j?.res?.resCode ?? j?.rescode ?? (res.ok ? "200" : res.status));
    if (code === "200") return { ok: true, id: j?.orderid ?? j?.id ?? null };
    return {
      ok: false,
      message: String(j?.res?.resDesc ?? j?.resdesc ?? `HTTP ${res.status}`).slice(0, 200),
    };
  } catch {
    return { ok: false, message: "ต่อ ZORT ไม่ได้" };
  }
}

/**
 * ยืนยันว่าออเดอร์ใบนี้จ่ายเงินแล้ว แล้วเดินงานที่เหลือให้ครบ
 *
 * ⚠️ ต้องเรียกซ้ำได้โดยไม่เกิดผลซ้ำ — เงินเข้าอาจถูกยืนยันสองทางพร้อมกัน
 *    (Beam ยิง webhook มาบอก + หน้าเว็บของลูกค้าถามเอง)
 *    ตัวกันอยู่ที่ธง done ใน finalizeOrder
 */
export async function markOrderPaid(order, store, req, context) {
  if (order.paid) return order;
  order.paid = true;
  order.paidAt = Date.now();
  order.status = "new";
  await store.setJSON(`o/${order.id}`, order);

  // จดไว้ว่าเคยมีเงินเข้าจริงแล้ว — หน้าสถานะระบบใช้ตัวนี้เตือน
  // ว่ายังไม่เคยมีใครจ่ายเงินสำเร็จเลยสักครั้ง (แปลว่ายังไม่ได้ทดสอบจ่ายจริง)
  // ถูกกว่าการไล่อ่านออเดอร์ทุกใบมานับ และเตือนเองโดยไม่ต้องมีใครจำ
  await store.setJSON("beam-first-paid", { at: Date.now(), orderId: order.id }).catch(() => {});

  const buyer = await currentUser(req, usersStore())
    .then((r) => r?.user ?? null)
    .catch(() => null);

  return finalizeOrder({
    order, store, usersStore, buyer, slip: null, req, context, zortAddOrder,
  });
}

export const config = { path: "/api/orders" };
