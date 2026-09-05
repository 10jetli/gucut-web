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

/** ยอดรวมของใบ — TikTok ส่ง payment เป็นก้อน และเป็น "สตริง" ไม่ใช่ตัวเลข
 *  ⚠️ **ต้องรายงานเมื่ออ่านไม่ได้** (ผู้ตรวจจับได้ 6 ก.ย. 2569) — ของเดิมคืน 0 เงียบ ๆ
 *     แล้ว 0 นั้นไปโผล่เป็น `api_amount` ในการเทียบยอด ⇒ อ่านออกมาเป็น "สองฝั่งไม่ตรง"
 *     ทั้งที่ความจริงคือ "อ่านฟิลด์ไม่ได้" — คนละเรื่องกันคนละโลก
 *  คืน { amount, how } — how: "total" (มีตัวรวมมาให้) · "sum" (บวกเอง) · null (อ่านไม่ได้) */
const orderAmount = (o) => {
  const p = o?.payment;
  if (!p || typeof p !== "object") return { amount: 0, how: null };
  const total = pick(p, ["total_amount", "total"]);
  if (total !== undefined) return { amount: num(total), how: "total" };
  const parts = ["sub_total", "shipping_fee", "seller_discount"].filter((k) => p[k] !== undefined);
  if (!parts.length) return { amount: 0, how: null };
  return {
    amount: num(p.sub_total) + num(p.shipping_fee) - num(p.seller_discount),
    how: "sum",
  };
};

// ⚠️ สร้างตารางเองเสมอ ห้ามรอให้ใครไปกด ?init=1 (บทเรียน 2 ก.ย. 2569: ตายเงียบที่ no such table)
let tablesReady = false;
async function ensureTables() {
  if (tablesReady) return;
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS tiktok_orders (
      order_id TEXT PRIMARY KEY, status TEXT, amount REAL NOT NULL DEFAULT 0,
      currency TEXT, order_date TEXT, create_time INTEGER, updated_at TEXT, items_fp TEXT)`
  );
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS tiktok_order_items (
      order_id TEXT NOT NULL, line INTEGER NOT NULL, sku TEXT, name TEXT,
      qty REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (order_id, line))`
  );
  // ⚠️ คอลัมน์ที่เพิ่มทีหลังต้องมาทาง ALTER เสมอ (ฐานที่สร้างไปแล้วไม่ได้ CREATE ใหม่)
  await coreQuery(`ALTER TABLE tiktok_orders ADD COLUMN items_fp TEXT`).catch(() => {});
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
  /* ⚠️ หลุดเพดานหน้าแล้วต้องโยน error — คืนของบางส่วนเหมือนครบ = api_orders หดเงียบ ๆ
      แล้วอ่านออกมาเป็น "ZORT กับ API ไม่ตรงกัน" (กติกาเดียวกับฝั่งสต็อก) */
  const MAX_PAGES = 20;
  for (let page = 0; page <= MAX_PAGES; page++) {
    if (page === MAX_PAGES) {
      throw new Error(`ออเดอร์ TikTok ช่วงนี้เกิน ${MAX_PAGES * 100} ใบ — ต้องลด days หรือขยายเพดานหน้า`);
    }
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
  // ⚠️ ทิ้งได้ แต่ต้องนับ — ถ้าชื่อคีย์ id ไม่ตรง จะได้ orders:0 ซึ่งแยกไม่ออกจาก "ไม่มีออเดอร์"
  const noId = orders.filter((o) => !o?.id).length;
  if (noId) unmapped.add("order.id");
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
        /* ⚠️ TikTok นับ **1 บรรทัด = 1 ชิ้น** (ตามที่เห็นในเอกสาร) จึงไม่มี quantity ในบรรทัด
            แต่ถ้าวันหนึ่งมีขึ้นมาแล้วชื่อไม่ตรง เราจะได้ 1 ทุกบรรทัดเงียบ ๆ ซึ่ง
            **อันตรายกว่าได้ 0 เพราะดูสมเหตุสมผล** ⇒ แยก "ไม่มีฟิลด์" (ปกติ) ออกจาก
            "มีฟิลด์แต่อ่านไม่ได้" (ต้องฟ้อง) · และห้ามใช้ `|| 1` ซึ่งเปลี่ยนเลข 0 ที่ถูกต้องให้เป็น 1 */
        const rawQty = it?.quantity;
        if (rawQty !== undefined && !Number.isFinite(Number(rawQty))) unmapped.add("item.qty");
        return {
          line: idx + 1,
          sku: String(sku ?? "").trim().slice(0, 60),
          name: String(nm ?? "").slice(0, 120),
          qty: rawQty === undefined ? 1 : num(rawQty),
          price: num(pr),
        };
      });
      const amt = orderAmount(o);
      if (amt.how === null) unmapped.add("payment.amount");
      const cur = o?.payment?.currency;
      if (cur === undefined) unmapped.add("payment.currency");
      /* ⚠️ **ลายนิ้วมือของรายการสินค้า** — ตัวเทียบ "เปลี่ยนหรือยัง" ของเดิมดูแค่
          status/amount/วัน ⇒ วันที่แก้ชื่อฟิลด์ให้ถูก ใบเก่าที่สามค่านั้นไม่ขยับ
          **จะไม่ถูกเขียนใหม่ตลอดกาล** รายการสินค้าที่แปลผิดจะแช่แข็งอยู่อย่างนั้น
          (ผู้ตรวจจับได้ 6 ก.ย. 2569 — คลาสเดียวกับ [[new-columns-need-backfill]]) */
      const fp = items.map((i) => `${i.sku}:${i.qty}:${i.price}`).join("|").slice(0, 400);
      return {
        id: String(o.id),
        status: String(status ?? ""),
        amount: amt.amount,
        currency: String(cur ?? "").slice(0, 8),
        day: thaiDay(o.create_time),
        ct: num(o.create_time),
        items,
        fp,
      };
    });

  if (!rows.length) return { days, orders: 0, droppedNoId: noId, unmapped: [...unmapped] };

  // 3) เขียนเฉพาะใบที่เปลี่ยนจริง — เหตุผลเดียวกับกระจกอื่น (โควตาเขียนของ D1)
  const prev = new Map(
    (
      await coreQuery(`SELECT order_id, status, amount, order_date, items_fp FROM tiktok_orders`)
    ).map((r) => [r.order_id, r])
  );
  const changed = rows.filter((r) => {
    const p = prev.get(r.id);
    return (
      !p ||
      String(p.status ?? "") !== r.status ||
      num(p.amount) !== r.amount ||
      String(p.order_date ?? "") !== r.day ||
      // รายการสินค้าเปลี่ยน (รวมถึงกรณีเราแก้ชื่อฟิลด์ให้ถูกแล้วอ่านได้ต่างจากเดิม)
      String(p.items_fp ?? "") !== r.fp
    );
  });
  const skipped = rows.length - changed.length;

  /* ⚠️ **ลำดับสำคัญ: เขียนรายการสินค้าก่อน แล้วค่อยเขียนหัวใบ** (ผู้ตรวจจับได้ 6 ก.ย. 2569)
      D1 ไม่มี transaction ข้ามคำสั่ง ⇒ ถ้าเขียนหัวใบก่อนแล้ว DELETE/INSERT รายการสินค้าล้ม
      รอบถัดไปใบนั้นจะ "ไม่เปลี่ยน" (หัวใบตรงแล้ว) ⇒ **ไม่เข้ารายการซ่อม ของหายถาวร**
      เขียนสินค้าก่อน: ล้มเมื่อไหร่หัวใบยังเป็นค่าเก่า ⇒ รอบหน้ายังถูกหยิบมาซ่อมเสมอ
      ⚠️ และแบ่งก้อนด้วย **จำนวนไบต์** ไม่ใช่จำนวนใบ — ใบใหญ่ไม่กี่ใบก็ทะลุเพดาน ~100KB ได้ */
  let itemRows = 0;
  {
    const MAX_SQL = 80_000;
    let batch = [];
    let ids = [];
    let bytes = 0;
    const flush = async () => {
      if (!ids.length) return;
      await coreQuery(`DELETE FROM tiktok_order_items WHERE order_id IN (${ids.join(",")})`);
      if (batch.length) {
        await coreQuery(
          `INSERT INTO tiktok_order_items (order_id,line,sku,name,qty,price) VALUES ${batch.join(",")}`
        );
      }
      batch = [];
      ids = [];
      bytes = 0;
    };
    for (const r of changed) {
      const vals = r.items.map(
        (it) => `(${esc(r.id)},${it.line},${esc(it.sku)},${esc(it.name)},${it.qty},${it.price})`
      );
      const size = vals.reduce((n, v) => n + v.length + 1, 0) + esc(r.id).length + 1;
      if (bytes + size > MAX_SQL) await flush();
      ids.push(esc(r.id));
      batch.push(...vals);
      bytes += size;
      itemRows += r.items.length;
    }
    await flush();
  }

  for (let i = 0; i < changed.length; i += 80) {
    const values = changed
      .slice(i, i + 80)
      .map(
        (r) =>
          `(${esc(r.id)},${esc(r.status)},${r.amount},${esc(r.currency)},${esc(r.day)},${r.ct},datetime('now'),${esc(r.fp)})`
      )
      .join(",");
    await coreQuery(
      `INSERT INTO tiktok_orders (order_id,status,amount,currency,order_date,create_time,updated_at,items_fp)
       VALUES ${values}
       ON CONFLICT(order_id) DO UPDATE SET
         status=excluded.status, amount=excluded.amount, currency=excluded.currency,
         order_date=excluded.order_date, updated_at=excluded.updated_at, items_fp=excluded.items_fp`
    );
  }

  return {
    days,
    orders: rows.length,
    written: changed.length,
    skipped,
    itemRows,
    droppedNoId: noId,
    // ⚠️ ว่าง = แปลได้ครบทุกฟิลด์ · ไม่ว่าง = **มีของที่เขียน 0/ว่างลงฐานเพราะหาชื่อไม่เจอ**
    //    จอกับ Telegram ต้องเอาไปโชว์ ห้ามกลืน
    unmapped: [...unmapped],
  };
}

/* สถานะทั้งชุดจากเอกสารทางการ (order_status ของ Get Order List 202309 — อ่านของจริงแล้ว):
     UNPAID · ON_HOLD · AWAITING_SHIPMENT · PARTIALLY_SHIPPING · AWAITING_COLLECTION
     · IN_TRANSIT · DELIVERED · COMPLETED · CANCELLED
   ⚠️ **คนละภาษากับสถานะ TikTok ที่มาทาง ZORT** ซึ่งเป็น **รหัสตัวเลข** (121 · 130 · 140)
      ⇒ ห้ามเอาค่าจากตารางนี้ไปเข้า `readStatus()` ของ order-status.mjs
        `COMPLETED`/`CANCELLED` สะกดชนกับ Shopee เป๊ะ จะถูกนับเป็นของ Shopee เงียบ ๆ
   ไม่นับเป็นยอดขาย: UNPAID ยังไม่จ่าย (ZORT ยังไม่รับเข้า) · CANCELLED ยกเลิก */
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
  /* ⚠️ ฝั่ง ZORT คัดด้วย `LIKE '%TikTok%'` — เป็นการจัดประเภทด้วยสตริงย่อยเหมือนฝั่ง Shopee
      วันนี้ (6 ก.ย. 2569) ในกระจกมีชื่อเดียวคือ 'TIKTOK' จึงยังปลอดภัย
      แต่ถ้ามีช่องทางชื่ออื่นที่มีคำว่า TikTok โผล่มา (เช่นร้านอื่น) จะถูกนับรวมเงียบ ๆ
      ⇒ ใช้ตัวจับตัวเดียวกับฝั่ง Shopee — เจอมากกว่าหนึ่งชื่อเมื่อไหร่ให้เตือนในข้อความเลย */
  const { zortChannelsOn } = await import("./shopee-orders.mjs");
  const chans = await zortChannelsOn(day, "TikTok").catch(() => []);
  const extra =
    chans.length > 1
      ? `\n   ⚠️ ฝั่ง ZORT วันนี้นับจาก ${chans.length} ช่องทาง: ` +
        chans.map((c) => `${c.channel} ${c.orders}`).join(" · ") +
        " — เช็คว่าเป็นร้านเราทุกช่องทางไหม"
      : "";
  return (
    `🎵 TikTok ตรง API: ${r.api_orders} ใบ · ฿${num(r.api_amount).toLocaleString("th-TH")} ` +
    `| ZORT: ${r.zort_orders} ใบ · ฿${num(r.zort_amount).toLocaleString("th-TH")} ${flag}${extra}`
  );
}
