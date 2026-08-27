// ทวงตะกร้า + ทวงยอดค้างจ่าย — แจ้ง "ลูกค้า" ไม่ใช่ร้าน (28 ส.ค. 2569)
//
// เจ้าของร้านสั่ง "ต้องมีระบบแจ้งเตือน ในตะกร้า กับ ชำระเงิน — แจ้งลูกค้า ไม่ใช่ผม"
// ฟีเจอร์เดียวกับระบบทวงตะกร้าของ Duoke ที่ร้านใช้กับ Shopee/Lazada อยู่
// (เหตุผลที่ร้านเลือก Duoke ก็คือตัวนี้ — ตอนนี้เว็บเรามีของตัวเองแล้ว)
//
// วิ่งพ่วงงานตามเวลาเดียวกับตัวกวาด Beam (ทุกครึ่งชั่วโมง) — ไม่ตั้ง cron เพิ่ม
//
// ช่องทางแจ้ง: LINE (@gucut1) + เด้งเข้าเครื่อง (Web Push) — ตามที่ลูกค้าคนนั้นมี
// ⚠️ เป็นการเตือนเรื่องของลูกค้าเอง (transactional) ไม่ใช่โฆษณา — อยู่ในกติกา LINE
// ⚠️ เตือน "ครั้งเดียว" ต่อออเดอร์/ต่อตะกร้าหนึ่งชุด — ทวงซ้ำซาก = โดนบล็อก เสียช่องทางถาวร
//
// กติกาเวลา
// - ยอดค้างจ่าย: ออเดอร์ pending อายุ 45 นาที – 24 ชม. (สด ๆ อย่าเพิ่งทวง · เกินวันแล้วปล่อย)
// - ตะกร้าค้าง: แตะตะกร้าล่าสุด 3 – 24 ชม. ก่อน และไม่มีออเดอร์ใหม่กว่านั้นจากเบอร์เดียวกัน
//   (ตะกร้ารู้เฉพาะลูกค้าที่ล็อกอิน — คนไม่ล็อกอินเว็บไม่รู้จักเขา แจ้งไม่ได้)

import { lineToCustomer } from "./notify-customer.mjs";
import { pushToUser } from "./push.mjs";
import { SITE_URL } from "./site.mjs";

const H = 3600 * 1000;

async function tellCustomer(phone, text, url, tag) {
  // สองช่องทางคู่ขนาน — มีช่องไหนก็ถึงช่องนั้น พลาดทั้งคู่ก็เงียบ ๆ ไป
  await lineToCustomer(phone, text, url).catch(() => {});
  await pushToUser(phone, {
    title: "GUCUT",
    body: text.replace(/^GUCUT: /, ""),
    url: url.replace(SITE_URL, ""),
    tag,
  }).catch(() => {});
}

/** ทวงออเดอร์ที่กดสั่งแล้วแต่ยังไม่จ่าย — ครั้งเดียวต่อใบ */
export async function remindPendingPayments(store) {
  const { blobs } = await store.list({ prefix: "o/" });
  const now = Date.now();
  let sent = 0;
  for (const b of blobs.slice(0, 60)) {
    if (sent >= 10) break;
    const o = await store.get(b.key, { type: "json" }).catch(() => null);
    if (!o || o.status !== "pending") continue;
    const age = now - (o.at || 0);
    if (age < 0.75 * H || age > 24 * H) continue;
    if (o.notified?.payRemind) continue;
    o.notified = { ...(o.notified || {}), payRemind: true };
    await store.setJSON(`o/${o.id}`, o);
    await tellCustomer(
      o.customer?.phone,
      `GUCUT: ออเดอร์ #${o.id} ยอด ฿${Number(o.total || 0).toLocaleString("th-TH")} ยังไม่ได้ชำระนะคะ กดกลับมาจ่ายต่อได้เลย ของยังถูกกันไว้ให้ค่ะ 🛒`,
      `${SITE_URL}/account/orders/?tab=pay`,
      `payremind-${o.id}`,
    );
    sent++;
  }
  return sent;
}

/** ทวงตะกร้าที่ค้างไว้ — ครั้งเดียวต่อตะกร้าหนึ่งชุด (แตะตะกร้าใหม่ = ชุดใหม่) */
export async function remindStaleCarts(store) {
  const { blobs } = await store.list({ prefix: "cart/" });
  const now = Date.now();

  // เบอร์ที่เพิ่งมีออเดอร์แล้ว ไม่ต้องทวง — เขาซื้อไปแล้ว
  const ordered = new Map(); // phone → เวลาออเดอร์ล่าสุด
  const o = await store.list({ prefix: "o/" });
  for (const b of o.blobs.slice(0, 120)) {
    const od = await store.get(b.key, { type: "json" }).catch(() => null);
    const ph = od?.customer?.phone?.replace(/\D/g, "");
    if (ph) ordered.set(ph, Math.max(ordered.get(ph) || 0, od.at || 0));
  }

  let sent = 0;
  for (const b of blobs.slice(0, 60)) {
    if (sent >= 10) break;
    const c = await store.get(b.key, { type: "json" }).catch(() => null);
    if (!c || c.reminded) continue;
    const age = now - (c.at || 0);
    if (age < 3 * H) continue;
    if (age > 24 * H) { await store.delete(b.key).catch(() => {}); continue; }
    const phone = b.key.slice("cart/".length);
    if ((ordered.get(phone) || 0) > (c.at || 0)) {
      await store.delete(b.key).catch(() => {});   // สั่งไปแล้วหลังแตะตะกร้า — จบ
      continue;
    }
    c.reminded = true;
    await store.setJSON(b.key, c);
    const n = Number(c.count) || (Array.isArray(c.items) ? c.items.length : 0);
    const first = Array.isArray(c.items) && c.items[0]?.t ? String(c.items[0].t).slice(0, 40) : "";
    await tellCustomer(
      phone,
      `GUCUT: ${first ? `"${first}"${n > 1 ? ` และอีก ${n - 1} รายการ` : ""}` : `ของ ${n} รายการ`} ยังอยู่ในตะกร้านะคะ (฿${Number(c.total || 0).toLocaleString("th-TH")}) กดกลับมาสั่งต่อได้เลยค่ะ 🛒`,
      `${SITE_URL}/cart/`,
      `cartremind-${phone}`,
    );
    sent++;
  }
  return sent;
}
