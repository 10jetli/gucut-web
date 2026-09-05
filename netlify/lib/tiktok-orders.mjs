// ออเดอร์ TikTok Shop ตรงจาก Open API → คลังเงา D1 (แผนลับตัด ZORT ขั้น 3 — ระยะรันคู่)
//
// ฝาแฝดของ `shopee-orders.mjs` ตั้งใจให้โครงเหมือนกันเป๊ะ เพื่อให้อ่านคู่กันแล้วเห็นความต่างทันที
// ⚠️ ตารางแยก `tiktok_orders` — ยัดรวมกับ `orders` (กระจก ZORT) เมื่อไหร่ recon จะนับเบิ้ลเงียบ ๆ
// ⚠️ **ไม่เก็บชื่อ/ที่อยู่/เบอร์ผู้รับ** เหมือนฝั่ง Shopee — เก็บแค่ที่ใช้เทียบยอดจริง ๆ
//    (TikTok ส่งข้อมูลผู้รับมาเต็มในคำตอบเดียวกัน จึงต้องตั้งใจ "ไม่หยิบ" ไม่ใช่ "ยังไม่ได้หยิบ")
//
// 📌 สัญญาที่ยืนยันจากเอกสารทางการแล้ว (6 ก.ย. 2569 — เปิดหน้า Get Order List 202309 ของจริง)
//    POST /order/202309/orders/search
//    query : app_key · sign · timestamp · page_size(บังคับ 1-100) · sort_field · sort_order · page_token · shop_cipher
//    body  : order_status · create_time_ge · create_time_lt · update_time_ge · update_time_lt
//            · shipping_type · buyer_user_id · is_buyer_request_cancel · warehouse_ids
//    resp  : data.next_page_token · data.total_count · data.orders[]
//    orders[] ที่เห็นตัวอย่างจริงแล้ว: id · create_time · buyer_message · shipping_provider
//            · packages[] · payment{currency,sub_total,shipping_fee,seller_discount,...}
//
// ⚠️ **ชื่อฟิลด์ที่ยังไม่ได้เห็นกับตา** (status · รายการสินค้า) เอกสารพับไว้อ่านไม่ได้
//    ⇒ ห้ามเดาแล้วเขียนเงียบ ๆ · ที่นี่จึง **ประกาศชื่อที่คาดไว้เป็นรายการ** แล้ว
//      ถ้าไม่เจอสักชื่อ ให้ **คืน `unmapped` ออกมาให้เห็น** ไม่ใช่เขียน 0 ลงฐานแล้วจบ
//      (เลข 0 ที่มาจาก "หาไม่เจอ" หน้าตาเหมือนเลข 0 ที่ถูกต้องทุกประการ — ดู [[three-states-not-two]])
//    ใช้ `tiktokOrderShape()` ส่องชื่อจริงหลัง deploy แล้วค่อยตัดชื่อที่ไม่ใช่ทิ้ง
import { coreQuery, coreReady } from "./coredb.mjs";
import { validToken, shopCall, VERSION } from "./tiktok.mjs";

const esc = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** วันแบบไทย (UTC+7) จาก epoch วินาที — กติกาเวลาเดียวกับทั้งโปรเจกต์ */
const thaiDay = (epoch) => new Date(num(epoch) * 1000 + 7 * 3600 * 1000).toISOString().slice(0, 10);

/* ชื่อที่ "คาดว่าใช่" เรียงตามลำดับความมั่นใจ — ตัวแรกที่มีอยู่จริงชนะ
   ⚠️ นี่ไม่ใช่การเดาแบบเงียบ: ตัวไหนหาไม่เจอเลยจะถูกรายงานใน `unmapped`
   ⚠️ ห้ามใส่ชื่อที่ "น่าจะใกล้เคียง" ลงมาเพิ่มเรื่อย ๆ — ยิ่งเยอะยิ่งกลบความจริง
      เจอชื่อจริงแล้วให้ **ลบตัวที่เหลือทิ้ง** เหลือชื่อเดียว */
const STATUS_KEYS = ["status", "order_status"];
const ITEMS_KEYS = ["line_items", "item_list", "items"];
const ITEM_SKU_KEYS = ["seller_sku", "sku_id", "sku"];
const ITEM_NAME_KEYS = ["product_name", "sku_name", "name"];
const ITEM_PRICE_KEYS = ["sale_price", "sku_sale_price", "original_price"];

const pick = (obj, keys) => {
  for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
};

/** ยอดรวมของใบ — TikTok ส่ง payment เป็นก้อน และเป็น "สตริง" ไม่ใช่ตัวเลข */
const orderAmount = (o) => {
  const p = o?.payment || {};
  const total = pick(p, ["total_amount", "total"]);
  if (total !== undefined) return num(total);
  // ไม่มี total → บวกเอง (sub_total + ค่าส่ง − ส่วนลดผู้ขาย) แล้วบอกว่าเป็นค่าคำนวณ
  return num(p.sub_total) + num(p.shipping_fee) - num(p.seller_discount);
};

// ⚠️ สร้างตารางเองเสมอ ห้ามรอให้ใครไปกด ?init=1 (บทเรียน 2 ก.ย. 2569: ตายเงียบที่ no such table)
let tablesReady = false;
async function ensureTables() {
  if (tablesReady) return;
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS tiktok_orders (
      order_id TEXT PRIMARY KEY, status TEXT, amount REAL NOT NULL DEFAULT 0,
      currency TEXT, order_date TEXT, create_time INTEGER, updated_at TEXT)`
  );
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS tiktok_order_items (
      order_id TEXT NOT NULL, line INTEGER NOT NULL, sku TEXT, name TEXT,
      qty REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (order_id, line))`
  );
  tablesReady = true;
}

/**
 * ส่องโครงสร้างคำตอบจริง — **คืนเฉพาะชื่อฟิลด์ ไม่คืนค่า**
 * ⚠️ ห้ามทำให้คืนค่าจริงเด็ดขาด คำตอบของ TikTok มีชื่อ-ที่อยู่-เบอร์ผู้รับอยู่ในนั้น
 *    หน้าที่ของตัวนี้คือบอกว่า "ฟิลด์ชื่ออะไรบ้าง" เพื่อเอาไปปิดช่องเดาเท่านั้น
 */
export async function tiktokOrderShape() {
  const t = await validToken();
  if (!t) return { skip: "ยังไม่ได้เชื่อมร้าน TikTok" };
  const now = Math.floor(Date.now() / 1000);
  const data = await shopCall(`/order/${VERSION}/orders/search`, {
    method: "POST",
    query: { page_size: "1", sort_field: "create_time", sort_order: "DESC" },
    body: { create_time_ge: now - 90 * 86400, create_time_lt: now },
  });
  const o = (data?.data?.orders || [])[0];
  if (!o) return { totalCount: num(data?.data?.total_count), note: "ช่วง 90 วันไม่มีออเดอร์เลย" };
  const items = pick(o, ITEMS_KEYS);
  return {
    totalCount: num(data?.data?.total_count),
    orderKeys: Object.keys(o).sort(),
    paymentKeys: Object.keys(o.payment || {}).sort(),
    itemsKeyName: ITEMS_KEYS.find((k) => o[k] !== undefined) ?? null,
    itemKeys: Array.isArray(items) && items[0] ? Object.keys(items[0]).sort() : [],
  };
}

/** กระจกออเดอร์ TikTok ช่วง N วันล่าสุดลง D1 — idempotent รันซ้ำได้ */
export async function syncTiktokOrders(days = 3) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const t = await validToken();
  if (!t) return { skip: "ยังไม่ได้เชื่อมร้าน TikTok" };
  await ensureTables();

  const now = Math.floor(Date.now() / 1000);
  const from = now - Math.max(1, Math.min(60, days)) * 86400;

  // 1) กวาดออเดอร์ทั้งช่วง — Get Order List คืน "ทั้งใบ" อยู่แล้ว ไม่ต้องยิงรายละเอียดซ้ำแบบ Shopee
  const orders = [];
  let pageToken = "";
  for (let page = 0; page < 20; page++) {
    const data = await shopCall(`/order/${VERSION}/orders/search`, {
      method: "POST",
      query: {
        page_size: "100",
        sort_field: "create_time",
        sort_order: "ASC",
        ...(pageToken ? { page_token: pageToken } : {}),
      },
      body: { create_time_ge: from, create_time_lt: now },
    });
    orders.push(...(data?.data?.orders || []));
    pageToken = String(data?.data?.next_page_token || "");
    if (!pageToken) break;
  }

  // 2) แปลงเป็นแถว — และ **จดไว้ว่าอะไรแปลไม่ได้**
  const unmapped = new Set();
  const rows = orders
    .filter((o) => o?.id)
    .map((o) => {
      const status = pick(o, STATUS_KEYS);
      if (status === undefined) unmapped.add("status");
      const rawItems = pick(o, ITEMS_KEYS);
      if (rawItems === undefined) unmapped.add("items");
      const items = (Array.isArray(rawItems) ? rawItems : []).map((it, idx) => {
        const sku = pick(it, ITEM_SKU_KEYS);
        const nm = pick(it, ITEM_NAME_KEYS);
        const pr = pick(it, ITEM_PRICE_KEYS);
        if (sku === undefined) unmapped.add("item.sku");
        if (nm === undefined) unmapped.add("item.name");
        if (pr === undefined) unmapped.add("item.price");
        return {
          line: idx + 1,
          sku: String(sku ?? "").trim().slice(0, 60),
          name: String(nm ?? "").slice(0, 120),
          // TikTok นับ 1 บรรทัด = 1 ชิ้น (ไม่มี quantity ในรายการสินค้า) — ยืนยันตอนส่องของจริง
          qty: num(it.quantity ?? 1) || 1,
          price: num(pr),
        };
      });
      return {
        id: String(o.id),
        status: String(status ?? ""),
        amount: orderAmount(o),
        currency: String(o?.payment?.currency ?? "").slice(0, 8),
        day: thaiDay(o.create_time),
        ct: num(o.create_time),
        items,
      };
    });

  if (!rows.length) return { days, orders: 0, unmapped: [...unmapped] };

  // 3) เขียนเฉพาะใบที่เปลี่ยนจริง — เหตุผลเดียวกับกระจกอื่น (โควตาเขียนของ D1)
  const prev = new Map(
    (await coreQuery(`SELECT order_id, status, amount, order_date FROM tiktok_orders`)).map((r) => [
      r.order_id,
      r,
    ])
  );
  const changed = rows.filter((r) => {
    const p = prev.get(r.id);
    return (
      !p ||
      String(p.status ?? "") !== r.status ||
      num(p.amount) !== r.amount ||
      String(p.order_date ?? "") !== r.day
    );
  });
  const skipped = rows.length - changed.length;

  for (let i = 0; i < changed.length; i += 80) {
    const values = changed
      .slice(i, i + 80)
      .map(
        (r) =>
          `(${esc(r.id)},${esc(r.status)},${r.amount},${esc(r.currency)},${esc(r.day)},${r.ct},datetime('now'))`
      )
      .join(",");
    await coreQuery(
      `INSERT INTO tiktok_orders (order_id,status,amount,currency,order_date,create_time,updated_at)
       VALUES ${values}
       ON CONFLICT(order_id) DO UPDATE SET
         status=excluded.status, amount=excluded.amount, currency=excluded.currency,
         order_date=excluded.order_date, updated_at=excluded.updated_at`
    );
  }

  let itemRows = 0;
  for (let i = 0; i < changed.length; i += 60) {
    const chunk = changed.slice(i, i + 60);
    const idList = chunk.map((r) => esc(r.id)).join(",");
    await coreQuery(`DELETE FROM tiktok_order_items WHERE order_id IN (${idList})`);
    const values = chunk
      .flatMap((r) =>
        r.items.map(
          (it) => `(${esc(r.id)},${it.line},${esc(it.sku)},${esc(it.name)},${it.qty},${it.price})`
        )
      )
      .join(",");
    if (values) {
      await coreQuery(
        `INSERT INTO tiktok_order_items (order_id,line,sku,name,qty,price) VALUES ${values}`
      );
      itemRows += chunk.reduce((n, r) => n + r.items.length, 0);
    }
  }

  return {
    days,
    orders: rows.length,
    written: changed.length,
    skipped,
    itemRows,
    // ⚠️ ว่าง = แปลได้ครบทุกฟิลด์ · ไม่ว่าง = **มีของที่เขียน 0/ว่างลงฐานเพราะหาชื่อไม่เจอ**
    //    จอกับ Telegram ต้องเอาไปโชว์ ห้ามกลืน
    unmapped: [...unmapped],
  };
}

// สถานะที่ไม่นับเป็นยอดขาย — UNPAID ยังไม่จ่าย (ZORT ยังไม่รับเข้า) · CANCELLED ยกเลิก
// ⚠️ ชุดนี้มาจากเอกสารทางการ (order_status ของ Get Order List) ไม่ได้เดาจากข้อมูลที่เห็น
const SKIP_STATUS = `('UNPAID','CANCELLED')`;

/** เทียบรายวัน N วันล่าสุด: TikTok API vs แถว ZORT ช่องทาง TikTok ใน D1 */
export async function tiktokRecon(daysBack = 7) {
  if (!coreReady()) return [];
  const rows = await coreQuery(
    `WITH api AS (
       SELECT order_date AS day, COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS s
       FROM tiktok_orders WHERE status NOT IN ${SKIP_STATUS}
       GROUP BY order_date
     ), zort AS (
       SELECT order_date AS day, COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS s
       FROM orders
       WHERE channel LIKE '%TikTok%'
         AND status NOT LIKE '%cancel%' AND status NOT LIKE '%void%' AND status NOT LIKE '%ยกเลิก%'
       GROUP BY order_date
     )
     SELECT COALESCE(api.day, zort.day) AS day,
            COALESCE(api.c,0) AS api_orders, COALESCE(api.s,0) AS api_amount,
            COALESCE(zort.c,0) AS zort_orders, COALESCE(zort.s,0) AS zort_amount
     FROM api FULL OUTER JOIN zort ON api.day = zort.day
     ORDER BY day DESC LIMIT ${Math.max(1, Math.min(30, daysBack))}`
  );
  return rows.map((r) => ({ ...r, match: num(r.api_orders) === num(r.zort_orders) }));
}

/** บรรทัดสรุปของเมื่อวานสำหรับพ่วงท้าย Telegram ยาม recon (คืน null ถ้าไม่มีข้อมูล) */
export async function tiktokReconYesterdayLine() {
  const day = new Date(Date.now() + 7 * 3600 * 1000 - 86400 * 1000).toISOString().slice(0, 10);
  const rows = await tiktokRecon(14);
  const r = rows.find((x) => x.day === day);
  if (!r) return null;
  const flag = r.match ? "✅" : "❗ต่างกัน";
  return (
    `🎵 TikTok ตรง API: ${r.api_orders} ใบ · ฿${num(r.api_amount).toLocaleString("th-TH")} ` +
    `| ZORT: ${r.zort_orders} ใบ · ฿${num(r.zort_amount).toLocaleString("th-TH")} ${flag}`
  );
}
