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
