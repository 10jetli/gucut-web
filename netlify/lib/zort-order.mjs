// ถามสถานะออเดอร์จาก ZORT — "สถานะก็ไปดึงเอาที่ ZORT" (เจ้าของร้านสั่ง 27 ส.ค. 2569)
//
// ร้านทำงานจริงใน ZORT (แพ็ค/ส่ง/ใส่เลขพัสดุ) ไม่ได้มากดในหลังร้านเว็บ
// เว็บจึงต้องดึงสถานะ+เลขพัสดุจาก ZORT มาโชว์ให้ลูกค้าเอง
// ออเดอร์เว็บถูกส่งเข้า ZORT ด้วย number = เลขออเดอร์เว็บ (orders.mjs) จึงตามกันเจอ

const BASE = "https://open-api.zortout.com/v4";

function creds() {
  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME || !ZORT_APIKEY || !ZORT_APISECRET) return null;
  return { storename: ZORT_STORENAME, apikey: ZORT_APIKEY, apisecret: ZORT_APISECRET };
}

/**
 * ดึงออเดอร์จาก ZORT ด้วยเลขออเดอร์เว็บ — คืน object ดิบของ ZORT หรือ null
 * ใช้ GetOrders แบบ keyword ค้นเลขที่เราตั้งเอง (GetOrderDetail ต้องใช้ id ภายในของ ZORT)
 */
export async function zortGetOrder(number) {
  const h = creds();
  if (!h || !number) return null;
  try {
    const r = await fetch(
      `${BASE}/Order/GetOrders?keyword=${encodeURIComponent(number)}&page=1&limit=5`,
      { headers: h, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    const list = d?.list || d?.List || [];
    // keyword ค้นกว้าง — ต้องเทียบเลขให้ตรงตัวเอง
    return list.find((o) => String(o.number || "").trim() === String(number).trim()) || null;
  } catch {
    return null;
  }
}

/**
 * กวาดออเดอร์ที่จ่ายแล้วแต่ยังไม่ส่ง ไปถาม ZORT — ส่งแล้วขยับสถานะ + แจ้ง LINE ลูกค้า
 * เรียกจากงานตามเวลาเดียวกับตัวกวาด Beam (ทุกครึ่งชั่วโมง) และไม่พึ่งลูกค้าเปิดหน้า
 *
 * ⚠️ แจ้งครั้งเดียวต่อใบ (ธง o.notified.shipped) — ห้ามสแปมลูกค้า
 * ⚠️ เดินหน้าอย่างเดียว ห้ามถอยสถานะ · จำกัด 14 วันล่าสุด + 10 ใบ/รอบ
 */
export async function syncShippingAll(store) {
  const { blobs } = await store.list({ prefix: "o/" });
  const cutoff = Date.now() - 14 * 24 * 3600 * 1000;
  let checked = 0, shipped = 0;
  for (const b of blobs) {
    if (checked >= 10) break;
    const o = await store.get(b.key, { type: "json" }).catch(() => null);
    if (!o || (o.at || 0) < cutoff) continue;
    if (!["new", "confirmed"].includes(o.status)) continue;
    checked++;
    const z = await zortGetOrder(o.id);
    if (!z) continue;
    let changed = false;
    if (z.trackingno) {
      o.tracking = { no: z.trackingno, channel: z.shippingchannel || "", at: z.shippingdate || "" };
      o.status = "shipped";
      changed = true;
      shipped++;
      o.notified = o.notified || {};
      if (!o.notified.shipped) {
        o.notified.shipped = true;
        const { lineToCustomer } = await import("./notify-customer.mjs");
        await lineToCustomer(
          o.customer?.phone,
          `GUCUT: ออเดอร์ #${o.id} จัดส่งแล้วนะคะ 🚚\n${o.tracking.channel || "ขนส่ง"} เลขพัสดุ ${o.tracking.no}\nติดตามพัสดุ: https://www.flashexpress.com/fle/tracking?se=${o.tracking.no}`,
          "https://gucut.com/account/orders/?tab=receive",
        ).catch(() => {});
      }
    } else if (String(z.status).toLowerCase() === "voided" && o.status !== "cancelled") {
      o.status = "cancelled";
      changed = true;
    }
    if (changed) await store.setJSON(`o/${o.id}`, o).catch(() => {});
  }
  return { checked, shipped };
}