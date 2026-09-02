// ออเดอร์ Shopee ตรงจาก Open API → คลังเงา D1 (แผนลับตัด ZORT ขั้น 3 — ระยะรันคู่)
//
// เป้าหมายระยะนี้: **เทียบ 3 ทางทุกวัน** Shopee API ↔ ZORT ↔ D1
// ให้ตรงกันติดต่อกันนานพอจนกล้าให้คลังเราเป็นตัวจริง — ระหว่างนี้ ZORT ทำงานปกติ ห้ามพัง
//
// ⚠️ เขียนลงตาราง `shopee_orders` แยกจาก `orders` โดยตั้งใจ
//    ยัดรวมเมื่อไหร่ recon เดิม (ZORT vs D1) จะนับเบิ้ลทันทีแบบเงียบ ๆ
// ⚠️ ไม่เก็บชื่อ/ที่อยู่/เบอร์ผู้รับ — เก็บแค่ buyer_username (นามแฝงสาธารณะ) พอเทียบยอด
// ⚠️ การนับ "ใบขาย" สองฝั่งนิยามไม่เท่ากันโดยธรรมชาติ:
//    Shopee นับตั้งแต่ UNPAID · ZORT รับเข้าเมื่อจ่ายแล้ว → recon ตัด UNPAID/CANCELLED ทิ้ง
//    ส่วนยอดเงิน Shopee (total_amount รวมส่วนลด/ค่าส่งฝั่งผู้ซื้อ) อาจไม่เท่ายอด ZORT
//    เป๊ะ ๆ — โชว์ทั้งคู่ให้เห็นส่วนต่างตรง ๆ ไม่กลบ (นี่คือหน้าที่ของระยะรันคู่)
import { coreQuery, coreReady } from "./coredb.mjs";
import { validToken, shopCall } from "./shopee.mjs";

const esc = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** วันแบบไทย (UTC+7) จาก epoch วินาที */
const thaiDay = (epoch) =>
  new Date((num(epoch)) * 1000 + 7 * 3600 * 1000).toISOString().slice(0, 10);

/** กระจกออเดอร์ Shopee ช่วง N วันล่าสุดลง D1 — idempotent รันซ้ำได้ */
export async function syncShopeeOrders(days = 3) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const t = await validToken();
  if (!t) return { skip: "ยังไม่ได้เชื่อมร้าน Shopee" };

  const now = Math.floor(Date.now() / 1000);
  const from = now - days * 86400;

  // 1) กวาดรายชื่อออเดอร์ในช่วงเวลา (Shopee ให้ช่วงละไม่เกิน 15 วัน — เราใช้ 3)
  const sns = [];
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const data = await shopCall("/api/v2/order/get_order_list", {
      time_range_field: "create_time",
      time_from: String(from),
      time_to: String(now),
      page_size: "100",
      ...(cursor ? { cursor } : {}),
    });
    const list = data?.response?.order_list ?? [];
    sns.push(...list.map((o) => o.order_sn).filter(Boolean));
    if (!data?.response?.more) break;
    cursor = String(data?.response?.next_cursor ?? "");
    if (!cursor) break;
  }
  if (!sns.length) return { days, orders: 0 };

  // 2) รายละเอียดทีละก้อน 50 ใบ (เพดานของ get_order_detail)
  const rows = [];
  for (let i = 0; i < sns.length; i += 50) {
    const data = await shopCall("/api/v2/order/get_order_detail", {
      order_sn_list: sns.slice(i, i + 50).join(","),
      response_optional_fields: "total_amount,buyer_username,item_list",
    });
    for (const o of data?.response?.order_list ?? []) {
      if (!o?.order_sn) continue;
      rows.push({
        sn: o.order_sn,
        status: o.order_status || "",
        amount: num(o.total_amount),
        buyer: String(o.buyer_username || "").slice(0, 60),
        day: thaiDay(o.create_time),
        ct: num(o.create_time),
        // ระดับ SKU — model_sku คือรหัสของตัวเลือกที่ลูกค้าหยิบ (ตรงกับ SKU ในระบบเรา)
        items: (o.item_list ?? []).map((it, idx) => ({
          line: idx + 1,
          sku: String(it.model_sku || it.item_sku || "").trim().slice(0, 60),
          name: String(it.item_name || "").slice(0, 120),
          qty: num(it.model_quantity_purchased),
          price: num(it.model_discounted_price),
        })),
      });
    }
  }

  // 3) upsert — ฝังค่าด้วย esc() ก้อนละ 80 (กติกาเดียวกับตัวกระจก ZORT)
  for (let i = 0; i < rows.length; i += 80) {
    const values = rows
      .slice(i, i + 80)
      .map(
        (r) =>
          `(${esc(r.sn)},${esc(r.status)},${r.amount},${esc(r.buyer)},${esc(r.day)},${r.ct},datetime('now'))`
      )
      .join(",");
    await coreQuery(
      `INSERT INTO shopee_orders (order_sn,status,amount,buyer,order_date,create_time,updated_at)
       VALUES ${values}
       ON CONFLICT(order_sn) DO UPDATE SET
         status=excluded.status, amount=excluded.amount, buyer=excluded.buyer,
         order_date=excluded.order_date, updated_at=excluded.updated_at`
    );
  }
  // 4) รายการสินค้า — ลบของเดิมทั้งใบแล้วเขียนใหม่ (idempotent)
  let itemRows = 0;
  for (let i = 0; i < rows.length; i += 60) {
    const chunk = rows.slice(i, i + 60);
    const snList = chunk.map((r) => esc(r.sn)).join(",");
    await coreQuery(`DELETE FROM shopee_order_items WHERE order_sn IN (${snList})`);
    const values = chunk
      .flatMap((r) =>
        (r.items ?? []).map(
          (it) => `(${esc(r.sn)},${it.line},${esc(it.sku)},${esc(it.name)},${it.qty},${it.price})`
        )
      )
      .join(",");
    if (values) {
      await coreQuery(
        `INSERT INTO shopee_order_items (order_sn,line,sku,name,qty,price) VALUES ${values}`
      );
      itemRows += (values.match(/\)/g) || []).length;
    }
  }
  return { days, orders: rows.length, itemRows };
}

// สถานะที่ไม่นับเป็นยอดขาย — UNPAID ยังไม่จ่าย (ZORT ยังไม่รับเข้า) · CANCELLED ยกเลิก
const SKIP_STATUS = `('UNPAID','CANCELLED','IN_CANCEL')`;

/** เทียบรายวัน N วันล่าสุด: Shopee API vs แถว ZORT ช่องทาง Shopee ใน D1 */
export async function shopeeRecon(daysBack = 7) {
  if (!coreReady()) return [];
  const rows = await coreQuery(
    `WITH api AS (
       SELECT order_date AS day, COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS s
       FROM shopee_orders WHERE status NOT IN ${SKIP_STATUS}
       GROUP BY order_date
     ), zort AS (
       SELECT order_date AS day, COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS s
       FROM orders
       WHERE channel LIKE '%Shopee%'
         AND status NOT LIKE '%cancel%' AND status NOT LIKE '%void%' AND status NOT LIKE '%ยกเลิก%'
       GROUP BY order_date
     )
     SELECT COALESCE(api.day, zort.day) AS day,
            COALESCE(api.c,0) AS api_orders, COALESCE(api.s,0) AS api_amount,
            COALESCE(zort.c,0) AS zort_orders, COALESCE(zort.s,0) AS zort_amount
     FROM api FULL OUTER JOIN zort ON api.day = zort.day
     ORDER BY day DESC LIMIT ${Math.max(1, Math.min(30, daysBack))}`
  );
  return rows.map((r) => ({
    ...r,
    match: num(r.api_orders) === num(r.zort_orders),
  }));
}

/** บรรทัดสรุปของเมื่อวานสำหรับพ่วงท้าย Telegram ยาม recon (คืน null ถ้าไม่มีข้อมูล) */
export async function shopeeReconYesterdayLine() {
  const day = new Date(Date.now() + 7 * 3600 * 1000 - 86400 * 1000).toISOString().slice(0, 10);
  const rows = await shopeeRecon(14);
  const r = rows.find((x) => x.day === day);
  if (!r) return null;
  const flag = r.match ? "✅" : "❗ต่างกัน";
  return (
    `🛒 Shopee ตรง API: ${r.api_orders} ใบ · ฿${num(r.api_amount).toLocaleString("th-TH")} ` +
    `| ZORT: ${r.zort_orders} ใบ · ฿${num(r.zort_amount).toLocaleString("th-TH")} ${flag}`
  );
}
