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
import { notifyShop } from "./tg.mjs";

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
  /* 🔴 **ติดธง "ทำแล้ว" เฉพาะเมื่อได้เลขเอกสารกลับมา** (แก้ 18 ก.ย. 2569)
     ของเดิม `order.steps.zort = true` ติดธงทุกกรณี **แม้ส่งไม่สำเร็จ**
     ⇒ ธงนี้คือเงื่อนไขกันส่งซ้ำ ⇒ ใบที่ล้มเหลว **ไม่มีวันถูกส่งซ้ำเลย**
     ⇒ ต่อให้มีตัวกวาดมาช่วย มันก็เห็นว่า "ทำแล้ว" แล้วข้ามไป
     🔑 ท่านประธานสั่ง 18 ก.ย.: "ต้องทำให้มันออโต้ ห้ามมีคนกดอะไร"
        ⇒ ไม่ติดธง = ตัวกวาดจะมาส่งซ้ำเองทุกครึ่งชั่วโมง
        ⇒ `skipped` (ยังไม่ได้ตั้งค่า ZORT) ติดธงได้ เพราะส่งซ้ำก็ไม่ช่วย */
  if (!order.steps.zort) {
    order.zort = await zortAddOrder(order);
    order.zortTries = (order.zortTries || 0) + 1;
    if (order.zort?.ok || order.zort?.skipped) order.steps.zort = true;
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

  /* 🔴 **`done` ต้องแปลว่า "ครบจริง" ไม่ใช่ "เดินมาถึงบรรทัดนี้"** (แก้ 18 ก.ย. 2569)
     ของเดิมตั้ง `done = true` ทุกกรณี ⇒ ใบที่ส่ง ZORT ไม่สำเร็จก็ถูกตราว่าครบ
     ⇒ `beam-sweep` มีบรรทัด `if (o.done) continue` ⇒ **ไม่มีใครกลับมาส่งซ้ำเลย**
     ⇒ นี่คือชั้นที่สองของบั๊กเดียวกัน: แก้ธง `steps.zort` อย่างเดียวไม่พอ

     ทีนี้: ยังไม่เข้า ZORT ⇒ ไม่ตั้ง done ⇒ `beam-sweep` (ทุกครึ่ง ชม.) เห็นใบ
     `paid && !done` แล้วเรียก `markOrderPaid` → `finalizeOrder` ให้เอง = **ส่งซ้ำอัตโนมัติ**
     (ขั้นอื่นไม่ถูกทำซ้ำ เพราะแต่ละขั้นมีธงของตัวเองอยู่แล้ว — กติกา 14 ก.ย.)

     ⏱️ **ต้องมีเพดาน** — ZORT ปฏิเสธถาวรได้ (เช่นไม่มี SKU นั้นในคลัง)
        ปล่อยวนจนครบหน้าต่าง 3 วันของตัวกวาด = เผาเครดิตฟรี 144 รอบ
        ครบเพดานแล้วยอมตั้ง done + ติดธง `zortFailed` ให้คนเห็น (แต่ `steps.zort`
        ยังเป็น false ⇒ สั่งส่งเดี๋ยวนั้นได้อยู่) */
  const MAX_ZORT_TRIES = 12;          // ครึ่ง ชม./รอบ ⇒ ลองเองราว 6 ชม.
  if (!order.steps.zort && (order.zortTries || 0) >= MAX_ZORT_TRIES) {
    order.zortFailed = true;
    order.steps.zort = true;       // เลิกวน — แต่ธง zortFailed ประกาศว่าไม่ได้สำเร็จ
  }
  if (order.steps.zort) order.done = true;

  /* 🔴 **ชั้นที่สามของบั๊กเดียวกัน: บล็อกแจ้งเตือนไม่มีธงกันซ้ำ** (แก้ 18 ก.ย. 2569)
     พอใบที่ ZORT ไม่เข้าถูกส่งซ้ำทุกครึ่งชั่วโมง `finalizeOrder` จะเดินถึงท้ายฟังก์ชันใหม่ทุกรอบ
     ⇒ เด้ง Telegram ร้าน · **LINE หาลูกค้า** · Web Push · ยิงยอดขายเข้าพิกเซล ซ้ำได้ถึง 12 รอบ
     ⇒ ผิดกฎที่ท่านประธานสั่งเองเรื่องทวงซ้ำ: **โดนบล็อก LINE = เสียช่องทางถาวร**
        และยอดขายที่ยิงเข้าพิกเซลซ้ำจะทำตัวเลขโฆษณาพองโดยไม่มีใครจับได้

     🔑 ติดธงก่อนส่ง ไม่ใช่หลังส่ง — ทิศของความผิดต่างกัน:
        แจ้งไม่ถึงรอบเดียว = ร้านยังเห็นใบใน /admin/orders/ อยู่ดี
        แจ้งซ้ำ 12 รอบ = ลูกค้าบล็อก LINE ร้าน เอาคืนไม่ได้ */
  const shouldNotify = !order.steps.notified;
  order.steps.notified = true;
  await save();
  if (!shouldNotify) return order;   // รอบส่งซ้ำ ZORT — เงียบ ไม่เด้งซ้ำ

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
    /* 🔑 **ประกาศว่าเข้า ZORT ได้เฉพาะเมื่อมีเลขเอกสาร** — "ok" ไม่ใช่หลักฐาน
       ของเดิมดู `order.zort?.ok` เฉย ๆ ⇒ ประกาศ "✅ เข้า ZORT แล้ว" ทั้งที่ค้นใน ZORT ไม่เจอใบ
       และห้ามบอกให้คนกดส่งซ้ำ — ท่านประธานสั่งว่าต้องออโต้ ห้ามมีคนกด */
    (order.zort?.ok
      ? `✅ เข้า ZORT แล้ว (เลขที่ ${order.zort.id || order.id})\n`
      : order.zort?.skipped
        ? ""
        : `⏳ ยังไม่เข้า ZORT (${order.zort?.message || "?"}) — ระบบส่งซ้ำเองทุกครึ่งชั่วโมง\n`) +
    `\nเปิดดู: ${SITE_URL}/admin/orders/`;

  /* 🔴 ย้ายไป `lib/tg.mjs` (18 ก.ย. 2569) — เดิมยิง fetch ตรงนี้ **จึง mock ไม่ได้**
     ⇒ ชุดทดสอบที่เรียก finalizeOrder ยิง Telegram จริงเข้ากลุ่มร้านทุกครั้ง
     ⇒ พอ `npm test` เข้าไปอยู่ใน prebuild = **ทุกครั้งที่ build เว็บ ท่านประธานได้ 3 ข้อความปลอม**
     ท่านประธานเจอเองแล้วส่งรูปมาถาม เหตุผลเต็มอยู่หัวไฟล์ tg.mjs */
  later(notifyShop(text).catch(() => {}));

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
