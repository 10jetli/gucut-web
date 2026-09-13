// ขั้นตอนที่ต้องทำ "หลังจากออเดอร์ถือว่าใช้ได้แล้ว"
//
// ทำไมต้องแยกออกมา
//   เดิมงานพวกนี้ทำทันทีตอนลูกค้ากดสั่ง ซึ่งถูกต้องสำหรับเก็บเงินปลายทาง
//   แต่พอรับเงินผ่าน Beam ออเดอร์จะยังไม่ใช่ของจริงจนกว่าเงินจะเข้า
//   ถ้าส่งเข้า ZORT ตั้งแต่ตอนกดสั่ง ลูกน้องจะเห็นออเดอร์แล้วแพ็คของให้คนที่ยังไม่จ่าย
//
//   ตัวนี้จึงถูกเรียกสองจังหวะแล้วแต่วิธีจ่าย
//     เก็บเงินปลายทาง → เรียกทันทีตอนกดสั่ง
//     Beam            → เรียกตอน "ยืนยันแล้วว่าเงินเข้าจริง" เท่านั้น
//
// ⚠️ ต้องเรียกซ้ำได้โดยไม่เกิดผลซ้ำ (idempotent)
//    เพราะเงินเข้าอาจถูกยืนยันสองทางพร้อมกัน (Beam ยิงมาบอก + หน้าเว็บถามเอง)
//    ตัวกันอยู่ที่ order.done — ใครมาทีหลังเห็นธงนี้แล้วออกไปเลย
import { markUsed } from "./coupons.mjs";
import { addPoints } from "./points.mjs";
import { pushToAdmins, pushToUser } from "./push.mjs";
import { sendPurchase } from "./marketing.mjs";
import { SITE_URL } from "./site.mjs";

/**
 * @param zortAddOrder ฟังก์ชันส่งเข้า ZORT (อยู่ใน orders.mjs ส่งเข้ามาเพื่อไม่ให้ import วน)
 */
export async function finalizeOrder({
  order, store, usersStore, buyer, slip, req, context, zortAddOrder,
}) {
  if (order.done) return order;      // ทำครบแล้ว อย่าทำซ้ำ

  /* 🔴 **จดทีละขั้น แล้วตั้ง done ตอนจบเท่านั้น** (แก้ 14 ก.ย. 2569 · งานกระดาน t_mtxys7hn · Codex พบ)
      เดิมตั้ง `done = true` ตั้งแต่บรรทัดแรก แล้วบันทึกลงถังพร้อมผล ZORT
      ⇒ ฟังก์ชันตายหลังบันทึก (ZORT ช้า 9 วิ · หมดเวลา) = โค้ดส่วนลด/แต้ม/แจ้งเตือน ไม่เคยถูกทำ
         แต่ธง done อยู่ในถังแล้ว ⇒ ใครมาเรียกซ้ำก็ออกไปทันที **ค้างเงียบตลอดกาล**
      ⇒ ตอนนี้แต่ละขั้นมีธงของตัวเองใน `order.steps` · ขั้นที่ทำแล้วไม่ทำซ้ำ (สำคัญสุดคือ ZORT —
         ส่งซ้ำ = เอกสารซ้ำ ลูกน้องแพ็คของสองรอบ) · `done` ตั้งหลังจดครบทุกขั้นเท่านั้น
      ⚠️ ยังไม่กันการเรียกพร้อมกันสองทางในวินาทีเดียว (webhook + หน้าจอลูกค้า) — ความเสี่ยงเดิม ไม่ได้เพิ่ม */
  order.steps = order.steps || {};
  const save = () => store.setJSON(`o/${order.id}`, order);

  // ส่งเข้า ZORT ให้ตัดสต็อกเอง — พังก็ไม่ล้มออเดอร์ แค่ติดธงให้ร้านกดส่งซ้ำได้
  if (!order.steps.zort) {
    order.zort = await zortAddOrder(order);
    order.steps.zort = true;
    await save();
  }

  // นับโควตาโค้ดส่วนลด "ตอนออเดอร์เป็นจริง" เท่านั้น
  // ไม่งั้นโค้ดจำนวนจำกัดจะหมดทั้งที่ยังไม่มีใครจ่ายเงินสักคน
  /* ⚠️ **ทุกขั้นที่มีผลข้างเคียงต้องบันทึกลงถังทันทีหลังทำ** — ธงในหน่วยความจำไม่นับ
      ตายตอนบันทึกท้ายสุด = กู้แล้วนับโค้ดซ้ำ / หักแต้มลูกค้าซ้ำ (เทส paid-recovery จับได้ 14 ก.ย. 2569) */
  /* 🔴 **บัญชีผู้ซื้อ = `order.buyerPhone` ที่จดตอนสั่งเท่านั้น** (แก้ 14 ก.ย. 2569 · t_mtxys8je)
      ห้ามใช้ `buyer` ที่ส่งเข้ามา — มาจากคุกกี้ของคำขอที่มายืนยันเงิน ซึ่งอาจเป็น webhook (ไม่มีใคร)
      หรือคนอื่นที่เปิดลิงก์เช็คสถานะ (หักผิดบัญชี) · ใบเก่าที่ไม่มี buyerPhone ⇒ ไม่หักเดา ติดธงแทน */
  const payer = order.buyerPhone ? { phone: order.buyerPhone } : null;

  if (!order.steps.coupon) {
    if (order.couponCode) await markUsed(order.couponCode, payer, usersStore()).catch(() => {});
    order.steps.coupon = true;
    await save();
  }

  // หักแต้มที่แลกไป (แต้มที่จะ "ได้" จากบิลนี้ รอจนออเดอร์สำเร็จก่อน)
  if (order.pointsUsed > 0 && !order.steps.points) {
    if (payer) {
      /* ⚠️ แต้มคือเงินของลูกค้า ⇒ **จดก่อนหัก** (หักได้อย่างมากครั้งเดียว)
          ตายระหว่างจดกับหัก = แต้มไม่ถูกหัก (ร้านเสียส่วนลดหนึ่งครั้ง) ดีกว่าหักลูกค้าซ้ำ */
      order.steps.points = true;
      delete order.pointsPending;
      await save();
      await addPoints(usersStore(), payer.phone, -order.pointsUsed,
        `ใช้แลกส่วนลด ฿${order.pointDiscount || 0}`, order.id).catch(() => {});
    } else {
      /* ไม่รู้ว่าเป็นบัญชีไหน (ตัวกวาดตามเวลาไม่มีคุกกี้ลูกค้า) ⇒ **ห้ามหักเดา** ติดธงให้เห็นแทน
         เดิมข้ามเงียบ ๆ · เรื่องหักผิดบัญชีเป็นงานแยก t_mtxys8je */
      order.pointsPending = true;
    }
  }

  order.done = true;
  await save();

  const jobs = [];
  const later = (p) => (context?.waitUntil ? context.waitUntil(p) : jobs.push(p));

  const c = order.customer;
  const lines = order.items
    .map((i) => `· ${i.title}${i.variant && i.variant !== "-" ? ` (${i.variant})` : ""} ×${i.qty} = ฿${(i.price * i.qty).toLocaleString("th-TH")}`)
    .join("\n");
  const text =
    `🛒 ออเดอร์ใหม่ #${order.id}\n` +
    `${c.name} · ${c.phone}\n\n${lines}\n` +
    (order.discount ? `ส่วนลด (${order.couponCode}) -฿${order.discount.toLocaleString("th-TH")}\n` : "") +
    `รวม ฿${order.total.toLocaleString("th-TH")} · ${order.paymentLabel}` +
    (order.paidAt ? " ✅ จ่ายแล้ว" : order.hasSlip ? " (แนบสลิปแล้ว)" : "") + "\n" +
    (order.taxInvoice ? `🧾 ขอใบกำกับภาษี: ${order.taxInvoice.name}\n` : "") +
    (order.priceAdjusted ? `🏷️ ราคาบางตัวถูกปรับตามคลัง ZORT (ต่างจากที่ตะกร้าส่งมา)\n` : "") +
    `📍 ${c.address} ${c.province} ${c.zip}\n` +
    (c.note ? `📝 ${c.note}\n` : "") +
    (order.zort?.ok
      ? `✅ เข้า ZORT แล้ว\n`
      : order.zort?.skipped
        ? ""
        : `⚠️ ส่งเข้า ZORT ไม่สำเร็จ (${order.zort?.message || "?"}) — กดส่งซ้ำได้ในหน้าออเดอร์\n`) +
    `\nเปิดดู: ${SITE_URL}/admin/orders/`;

  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    later(
      fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
      }).catch(() => {}),
    );
  }

  // แจ้ง LINE หาลูกค้า (ถ้าล็อกอินด้วย LINE + เพิ่มเพื่อน @gucut1) — 27 ส.ค. 2569
  later(
    import("./notify-customer.mjs")
      .then(({ lineToCustomer }) =>
        lineToCustomer(
          c.phone,
          order.paidAt
            ? `GUCUT: ได้รับชำระเงินออเดอร์ #${order.id} ยอด ฿${order.total.toLocaleString("th-TH")} แล้วนะคะ ร้านกำลังเตรียมจัดส่ง 📦`
            : `GUCUT: ได้รับออเดอร์ #${order.id} ยอด ฿${order.total.toLocaleString("th-TH")} แล้วนะคะ ร้านกำลังเตรียมจัดส่ง 📦`,
          `${SITE_URL}/account/orders/`,
        ),
      )
      .catch(() => {}),
  );

  // เด้งเข้าเครื่องลูกค้า (Web Push) — คู่ขนานกับ LINE สำหรับคนที่กดรับแจ้งเตือนไว้
  later(
    pushToUser(c.phone, {
      title: order.paidAt ? "GUCUT — ได้รับชำระเงินแล้ว ✅" : "GUCUT — ได้รับออเดอร์แล้ว",
      body: `ออเดอร์ #${order.id} ยอด ฿${order.total.toLocaleString("th-TH")} ร้านกำลังเตรียมจัดส่ง 📦`,
      url: "/account/orders/?tab=ship",
      tag: `order-${order.id}`,
    }).catch(() => {}),
  );

  later(
    pushToAdmins({
      title: `🛒 ออเดอร์ใหม่ ฿${order.total.toLocaleString("th-TH")}`,
      body: `${c.name} · ${order.paymentLabel}`,
      url: "/admin/orders/",
      tag: order.id,
    }).catch(() => {}),
  );

  if (process.env.ORDER_FORWARD_URL) {
    later(
      fetch(process.env.ORDER_FORWARD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...order, slipBase64: slip ?? null }),
      }).catch(() => {}),
    );
  }

  // ยิงยอดขายเข้าช่องทางโฆษณาจากเซิร์ฟเวอร์ (Meta / TikTok Conversions API)
  // ใช้ event id = เลขออเดอร์ ตรงกับที่เบราว์เซอร์ยิง ปลายทางจะรวมเป็นรายการเดียว
  later(
    sendPurchase(order, {
      /* ⚠️ ตัวนี้ **ไม่ใช่ตัวกันเดา** — ส่งให้พิกเซลโฆษณาใช้จับคู่ลูกค้า
          ทิศของความผิดต่างจากตัวกันเดา: ปลอมได้ก็แค่จับคู่โฆษณาเพี้ยน ไม่ได้เปิดช่องโจมตี
          แต่ยังอ่านตัวท้ายเหมือนกัน เพราะตัวหน้าเป็นค่าที่ผู้เรียกพิมพ์เองล้วน ๆ */
      ip:
        req?.headers?.get("x-nf-client-connection-ip") ||
        (req?.headers?.get("x-forwarded-for") || "")
          .split(",").map((s) => s.trim()).filter(Boolean).slice(-1)[0] ||
        undefined,
      userAgent: req?.headers?.get("user-agent") || undefined,
      sourceUrl: `${SITE_URL}/checkout/`,
    }).catch(() => {}),
  );

  if (jobs.length) await Promise.allSettled(jobs);
  return order;
}
