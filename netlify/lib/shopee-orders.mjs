// ออเดอร์ Shopee ตรงจาก Open API → คลังเงา D1 (แผนลับตัด ZORT ขั้น 3 — ระยะรันคู่)
// ฝาแฝด: netlify/lib/tiktok-orders.mjs — แก้คลาสไหนต้องดูคู่ (ด่าน check-code-twins.mjs)
//   เหตุ: B21 12 ต.ค. 2569 — รูเดียวกัน 3 รูถูกแก้ที่ TikTok ข้างเดียวตั้งแต่ 6 ก.ย.
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

// ⚠️ ตารางต้องสร้างเองได้ ห้ามรอให้ใครไปกด /api/core?init=1
//    เจอจริง 2 ก.ย. 2569: deploy แล้วทุกอย่างดูปกติ แต่ทุกรอบตายเงียบที่ "no such table"
//    งานตามเวลาไม่มีใครอ่าน log = ไม่มีใครรู้ (กติกาเดียวกับที่ฝั่งจอใช้อยู่แล้ว)
let tablesReady = false;
async function ensureTables() {
  if (tablesReady) return;
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS shopee_orders (
      order_sn TEXT PRIMARY KEY, status TEXT, amount REAL NOT NULL DEFAULT 0,
      buyer TEXT, order_date TEXT, create_time INTEGER, updated_at TEXT)`
  );
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS shopee_order_items (
      order_sn TEXT NOT NULL, line INTEGER NOT NULL, sku TEXT, name TEXT,
      qty REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (order_sn, line))`
  );
  /* ⚠️ **ลายนิ้วมือรายการสินค้า — ฝาแฝด TikTok มีตั้งแต่ 6 ก.ย. 2569 ฝั่งนี้ไม่เคยมี**
      ตัวเทียบ "เปลี่ยนหรือยัง" ด้านล่างดูแค่ status/amount/buyer/วัน ⇒ วันที่เราแก้ชื่อฟิลด์
      ให้ถูก ใบเก่าที่สี่ค่านั้นไม่ขยับ **จะไม่ถูกเขียนใหม่ตลอดกาล** รายการสินค้าที่แปลผิด
      จะแช่แข็งอยู่อย่างนั้น (คลาส [[new-columns-need-backfill]])
      📏 **ขอบเขตของการกวาดย้อนหลัง** — คอลัมน์ว่าง (NULL) เทียบไม่ตรงกับ fp ที่คิดใหม่เสมอ
         ⇒ ใบที่ **อยู่ในช่วง `days`** จะถูกเขียนใหม่ให้เองรอบแรกหลังเพิ่มคอลัมน์
         🔴 แต่ใบที่ **เก่ากว่าช่วง `days`** ไม่เคยถูกถามซ้ำ ⇒ `items_fp` ค้าง NULL ตลอดไป
            (ฝาแฝด TikTok ก็มีขอบเขตเดียวกันนี้ และไม่ได้เขียนไว้ — จดที่นี่ให้ทั้งคู่) */
  await coreQuery(`ALTER TABLE shopee_orders ADD COLUMN items_fp TEXT`).catch(() => {});
  tablesReady = true;
}

/* ── ตัวตัดสินสามตัวของ B21 — ยกออกมาให้ **ทดสอบได้** ────────────────────────
   เหตุ: ตรรกะนี้ตัดสินว่า "ไม่รู้" หรือ "ไม่มี" และตัดสินว่าจะ **ลบของจริงทิ้ง** หรือไม่
   ตอนฝังอยู่ในฟังก์ชันที่ต้องมีทั้งเน็ตและ D1 ⇒ เขียนผิดแล้วไม่มีอะไรแดง
   (ท่าเดียวกับ `อ่านสต็อกผู้ขาย`/`ตัดสินสต็อกอ่านไม่ได้` ใน shopee-stock.mjs) */

/** รายการสินค้าของออเดอร์หนึ่งใบ — `null` = **ยังไม่รู้** · `[]` = รู้แล้วว่าไม่มี
 *  ⚠️ เราขอ `item_list` ไปใน `response_optional_fields` ⇒ ไม่มี = ผิดคาด ต้องแยกให้ออก */
export function แปลรายการสินค้า(o) {
  if (!Array.isArray(o?.item_list)) return null;
  return o.item_list.map((it, idx) => ({
    line: idx + 1,
    sku: String(it?.model_sku || it?.item_sku || "").trim().slice(0, 60),
    name: String(it?.item_name || "").slice(0, 120),
    qty: num(it?.model_quantity_purchased),
    price: num(it?.model_discounted_price),
  }));
}

/** ลายนิ้วมือรายการสินค้า — `null` เข้า ⇒ `null` ออก (ห้ามยุบเป็นสตริงว่าง)
 *  ยุบเมื่อไหร่ ใบที่อ่านไม่ได้จะ "เปลี่ยน" ทุกรอบ แล้วไปลบของจริงทิ้งทุกรอบ */
export function ลายนิ้วมือรายการ(items) {
  if (items === null || items === undefined) return null;
  return items.map((i) => `${i.sku}:${i.qty}:${i.price}`).join("|").slice(0, 400);
}

/** ใบนี้ต้องเขียนลง D1 ใหม่ไหม — `p` = แถวเดิมใน D1 (ไม่มี = undefined) */
export function ต้องเขียนใหม่(p, r) {
  if (!p) return true;
  return (
    String(p.status ?? "") !== r.status ||
    num(p.amount) !== r.amount ||
    String(p.buyer ?? "") !== r.buyer ||
    String(p.order_date ?? "") !== r.day ||
    // ⚠️ เทียบรายการสินค้า **เฉพาะใบที่รู้** — `fp === null` คือยังไม่รู้ ไม่ใช่ "ไม่มี"
    (r.fp !== null && String(p.items_fp ?? "") !== r.fp)
  );
}

/** ค่าที่จะเขียนลงคอลัมน์ `items_fp` — ไม่รู้ ⇒ **คงค่าเดิม** ห้ามทับด้วยความว่าง */
export function ค่าitems_fp(r, p) {
  if (r.fp !== null) return esc(r.fp);
  return p?.items_fp == null ? "NULL" : esc(p.items_fp);
}

/** กระจกออเดอร์ Shopee ช่วง N วันล่าสุดลง D1 — idempotent รันซ้ำได้ */
export async function syncShopeeOrders(days = 3) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  await ensureTables();
  const t = await validToken();
  if (!t) return { skip: "ยังไม่ได้เชื่อมร้าน Shopee" };

  const now = Math.floor(Date.now() / 1000);
  const from = now - days * 86400;

  // 1) กวาดรายชื่อออเดอร์ในช่วงเวลา (Shopee ให้ช่วงละไม่เกิน 15 วัน — เราใช้ 3)
  const sns = [];
  /* 🔴 **B21 ภาคสอง (12 ต.ค. 2569)** — ฝาแฝด TikTok จด `unmapped.add("data.orders")`
      แต่ฝั่งนี้ `break` เงียบแล้วคืน `orders: 0` ⇒ **คลาสเดียวกัน แก้คนละท่า**
      ⇒ ของที่ "ไม่รู้" ถูกเล่าเป็น "ไม่มีออเดอร์" ซึ่งคือตัวบั๊กของใบ B21 เอง */
  const unmapped = new Set();
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const data = await shopCall("/api/v2/order/get_order_list", {
      time_range_field: "create_time",
      time_from: String(from),
      time_to: String(now),
      page_size: "100",
      ...(cursor ? { cursor } : {}),
    });
    /* 🔴 **B21 (แก้ 4 ต.ค. 2569)** — ของเดิม `?? []` กลืนทุกรูปที่ไม่มีช่อง `order_list`
       ⇒ "อ่านไม่ครบ" กับ "ไม่มีออเดอร์" แยกไม่ออก ⇒ รายงาน `orders: 0` เหมือนสำเร็จ */
    if (!data?.response || typeof data.response !== "object") {
      throw new Error("Shopee ตอบสำเร็จแต่ไม่มีกล่อง response — ถือว่าอ่านไม่ครบ ไม่ใช่ไม่มีออเดอร์");
    }
    const list = data.response.order_list;
    if (!Array.isArray(list)) {
      /* ⚠️ **หน้าที่ 2 ขึ้นไป: ต้องมีช่องนี้แน่นอน** เพราะมาถึงได้เพราะหน้าก่อนบอก `more: true`
         ⇒ ไม่มี = อ่านไม่ครบ ⇒ โยน
         ⚠️ **หน้าแรกตั้งใจไม่รัด** — ยังไม่เคยยิง Shopee ในวันที่ร้านไม่มีออเดอร์เลย
            เพื่อดูว่ามันคืน `{order_list: []}` หรือไม่มีช่องนี้ และเครื่องนี้ไม่มีคีย์ Shopee
            ⇒ **วัดไม่ได้ตอนแก้** · เดาผิด = แดงลวงทุกวันที่ร้านไม่มีออเดอร์ แล้วคนจะปิดด่าน
            (ท่าเดียวกับที่ฝั่งท่อเขียนกำกับไว้ใน B20) ⇒ ไปรัดเพิ่มวันที่มีคีย์ยิงพิสูจน์ */
      if (page > 0) {
        throw new Error(`Shopee หน้า ${page + 1} ไม่มีช่อง order_list ทั้งที่หน้าก่อนบอกว่ายังมีต่อ — อ่านไม่ครบ`);
      }
      unmapped.add("response.order_list");
      break;
    }
    sns.push(...list.map((o) => o.order_sn).filter(Boolean));
    if (!data?.response?.more) break;
    cursor = String(data?.response?.next_cursor ?? "");
    if (!cursor) break;
  }
  // ⚠️ คืน `unmapped` ด้วยเสมอ — ไม่งั้น "กวาดได้ 0 เพราะร้านว่าง" กับ
  //    "กวาดได้ 0 เพราะอ่านช่องไม่เจอ" หน้าตาเหมือนกันเป๊ะในรายงาน
  if (!sns.length) return { days, orders: 0, unmapped: [...unmapped] };

  // 2) รายละเอียดทีละก้อน 50 ใบ (เพดานของ get_order_detail)
  const rows = [];
  for (let i = 0; i < sns.length; i += 50) {
    const data = await shopCall("/api/v2/order/get_order_detail", {
      order_sn_list: sns.slice(i, i + 50).join(","),
      response_optional_fields: "total_amount,buyer_username,item_list",
    });
    /* 🔴 **B21 (แก้ 4 ต.ค. 2569)** — จุดนี้รัดได้เต็มที่ **โดยไม่ต้องเดาอะไรเลย**
       เพราะเรา **ถามไปเป็นรายเลขใบ** ⇒ จำนวนที่ควรได้กลับมาคือจำนวนที่เราถาม
       ⇒ ไม่มีช่อง `order_list` = อ่านไม่ครบแน่นอน (ไม่ใช่ "ไม่มีออเดอร์" เพราะเรารู้ว่ามี)
       ⇒ ได้น้อยกว่าที่ถาม = ขาดบางใบ ⇒ ของเดิมเอากองที่ขาดไปเขียนทับเป็นของครบ */
    const ก้อน = sns.slice(i, i + 50);
    const รายละเอียด = data?.response?.order_list;
    if (!Array.isArray(รายละเอียด)) {
      throw new Error(`Shopee ไม่คืน order_list ทั้งที่ถามรายละเอียดไป ${ก้อน.length} ใบ — อ่านไม่ครบ`);
    }
    if (รายละเอียด.length < ก้อน.length) {
      throw new Error(
        `Shopee คืนรายละเอียด ${รายละเอียด.length} ใบ จากที่ถาม ${ก้อน.length} ใบ — ขาด `
        + `${ก้อน.length - รายละเอียด.length} ใบ ⇒ ห้ามเอากองที่ขาดไปใช้เป็นของครบ`,
      );
    }
    for (const o of รายละเอียด) {
      if (!o?.order_sn) continue;
      rows.push({
        sn: o.order_sn,
        status: o.order_status || "",
        amount: num(o.total_amount),
        buyer: String(o.buyer_username || "").slice(0, 60),
        day: thaiDay(o.create_time),
        ct: num(o.create_time),
        /* ระดับ SKU — model_sku คือรหัสของตัวเลือกที่ลูกค้าหยิบ (ตรงกับ SKU ในระบบเรา)
           🔴 **B21 ภาคสอง** — ของเดิม `?? []` ⇒ ใบที่ Shopee ไม่คืน `item_list` มา
              จะถูกเขียนลง D1 เป็น **ใบที่ไม่มีสินค้าสักชิ้น** อย่างเงียบ ๆ
              แล้วรอบถัดไปจะไม่ถูกแก้ เพราะตัวเทียบไม่ได้ดูรายการสินค้า
              ⇒ ยิ่งร้าย: ขั้นที่ 4 `DELETE` แล้ว `INSERT` ของว่าง = **ลบรายการที่ถูกต้องทิ้ง**
              ⇒ `null` = ยังไม่รู้ · `[]` = รู้แล้วว่าไม่มี — ห้ามยุบสองอย่างนี้
              (เราขอ `item_list` ไปใน `response_optional_fields` ⇒ ไม่มี = ผิดคาด ต้องฟ้อง) */
        items: แปลรายการสินค้า(o),
      });
      if (!Array.isArray(o.item_list)) unmapped.add("order.item_list");
    }
  }

  /* ลายนิ้วมือรายการสินค้า — `null` แปลว่า **ยังไม่รู้** ⇒ ห้ามเอาไปเทียบ และห้ามเขียนทับ
     ถ้ายุบให้เป็นสตริงว่าง ใบที่อ่านไม่ได้จะ "เปลี่ยน" ทุกรอบ แล้วไปลบของจริงทิ้งทุกรอบ */
  for (const r of rows) {
    r.fp = ลายนิ้วมือรายการ(r.items);
  }

  // ⚠️ เขียนเฉพาะใบที่เปลี่ยนจริง — เหตุผลเดียวกับตัวกระจก ZORT (โควตาเขียนของ D1)
  const prev = new Map(
    (await coreQuery(
      `SELECT order_sn, status, amount, buyer, order_date, items_fp FROM shopee_orders`
    )).map(
      (r) => [r.order_sn, r]
    )
  );
  const changed = rows.filter((r) => ต้องเขียนใหม่(prev.get(r.sn), r));
  const skipped = rows.length - changed.length;

  // 3) upsert — ฝังค่าด้วย esc() ก้อนละ 80 (กติกาเดียวกับตัวกระจก ZORT)
  for (let i = 0; i < changed.length; i += 80) {
    const values = changed
      .slice(i, i + 80)
      .map(
        (r) =>
          `(${esc(r.sn)},${esc(r.status)},${r.amount},${esc(r.buyer)},${esc(r.day)},${r.ct},`
          + `datetime('now'),`
          // ไม่รู้รายการสินค้า ⇒ ส่งค่าเดิมกลับไป (ไม่มีค่าเดิม = NULL) **ห้ามส่ง '' ทับ**
          + `${ค่าitems_fp(r, prev.get(r.sn))})`
      )
      .join(",");
    await coreQuery(
      `INSERT INTO shopee_orders (order_sn,status,amount,buyer,order_date,create_time,updated_at,items_fp)
       VALUES ${values}
       ON CONFLICT(order_sn) DO UPDATE SET
         status=excluded.status, amount=excluded.amount, buyer=excluded.buyer,
         order_date=excluded.order_date, updated_at=excluded.updated_at,
         items_fp=excluded.items_fp`
    );
  }
  /* 4) รายการสินค้า — เขียนใหม่เฉพาะใบที่เปลี่ยน
     🔴 **B21 ภาคสอง** — ใบที่ยังไม่รู้รายการสินค้า (`items === null`) **ต้องไม่เข้าทั้ง
        `DELETE` และ `INSERT`** ท่านี้เป็นลบแล้วใส่ใหม่ ⇒ ปล่อยเข้าไป = **ลบของจริงทิ้ง
        แล้วใส่ความว่างแทน** ซึ่งแย่กว่าไม่ทำอะไรเลย (คลาส [[fixes-can-destroy-truth]]) */
  let itemRows = 0;
  const รู้รายการ = changed.filter((r) => r.items !== null);
  const itemsUnknown = changed.length - รู้รายการ.length;
  for (let i = 0; i < รู้รายการ.length; i += 60) {
    const chunk = รู้รายการ.slice(i, i + 60);
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
      /* ⚠️ เดิมนับ ")" ในสตริง SQL ซึ่งไม่ใช่จำนวนแถว — ชื่อสินค้าที่มีวงเล็บ (ไทยมีบ่อย)
          ทำให้ตัวเลขพองขึ้นเงียบ ๆ (ผู้ตรวจจับได้ 6 ก.ย. 2569 ตอนเทียบกับฝาแฝด TikTok) */
      itemRows += chunk.reduce((n, r) => n + (r.items?.length ?? 0), 0);
    }
  }
  /* ⚠️ `itemsUnknown` ต้องขึ้นรายงานเสมอ แม้เป็น 0 — ไม่งั้นวันที่มันไม่เป็น 0
      จะไม่มีใครสังเกต เพราะช่องที่เพิ่งโผล่มาอ่านเหมือนของใหม่ ไม่ใช่ของผิดปกติ */
  return {
    days,
    orders: rows.length,
    written: changed.length,
    skipped,
    itemRows,
    itemsUnknown,
    unmapped: [...unmapped],
  };
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
/* ⚠️ **ฝั่ง ZORT ของการเทียบนี้คัดด้วย `LIKE \'%Shopee%\'` ซึ่งเป็นการจัดประเภทด้วยสตริงย่อย**
    (กติกาที่เราห้ามตัวเองไว้ — [[no-substring-classification]])
    ตรวจของจริง 6 ก.ย. 2569: ในกระจกมีช่องทางชื่อ **\'ZAMA Shopee\' 134 ใบ** อยู่ด้วย
    ⇒ ถ้าช่องทางนั้นกลับมามีบิลเมื่อไหร่ **ฝั่ง ZORT จะบวมขึ้นเงียบ ๆ** แล้วดูเหมือน
      "API ดึงมาไม่ครบ" ทั้งที่ความจริงคือเรานับของร้านอื่นเข้ามา
    ตอนนี้ยังไม่กัด (30 วันล่าสุดไม่มีบิลของช่องทางนั้นเลย) จึง **ยังไม่เปลี่ยนวิธีคัด**
    เพราะเส้นนี้ร้านใช้จริงทุกวัน — แต่ **ต้องมีตัวจับไว้ก่อน** ไม่ใช่รอให้เจอตอนตัวเลขเพี้ยน
    ⇒ นับช่องทางที่ถูกคัดเข้ามาจริงในวันนั้น ถ้ามีมากกว่าหนึ่งชื่อ ให้ต่อท้ายข้อความเตือน */
async function zortChannelsOn(day, likeWord) {
  const rows = await coreQuery(
    `SELECT channel, COUNT(*) AS c FROM orders
     WHERE order_date = ? AND channel LIKE ? AND ${CANCEL_FREE}
     GROUP BY channel ORDER BY c DESC`,
    [day, `%${likeWord}%`]
  ).catch(() => []);
  return rows.map((r) => ({ channel: String(r.channel ?? ""), orders: num(r.c) }));
}

const CANCEL_FREE =
  `status NOT LIKE '%cancel%' AND status NOT LIKE '%void%' AND status NOT LIKE '%ยกเลิก%'`;

export async function shopeeReconYesterdayLine() {
  const day = new Date(Date.now() + 7 * 3600 * 1000 - 86400 * 1000).toISOString().slice(0, 10);
  const rows = await shopeeRecon(14);
  const r = rows.find((x) => x.day === day);
  if (!r) return null;
  const flag = r.match ? "✅" : "❗ต่างกัน";
  const chans = await zortChannelsOn(day, "Shopee");
  const extra =
    chans.length > 1
      ? `\n   ⚠️ ฝั่ง ZORT วันนี้นับจาก ${chans.length} ช่องทาง: ` +
        chans.map((c) => `${c.channel} ${c.orders}`).join(" · ") +
        " — เช็คว่าเป็นร้านเราทุกช่องทางไหม"
      : "";
  return (
    `🛒 Shopee ตรง API: ${r.api_orders} ใบ · ฿${num(r.api_amount).toLocaleString("th-TH")} ` +
    `| ZORT: ${r.zort_orders} ใบ · ฿${num(r.zort_amount).toLocaleString("th-TH")} ${flag}${extra}`
  );
}

export { zortChannelsOn };
