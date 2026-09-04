// คลังเงา GUCUT Core — กระจกออเดอร์จาก ZORT ทั้ง 2 ร้าน ลง D1
//
// สูตรเดียวกับตอนปลด Shopify: สร้างคู่ขนาน → เทียบผล → ค่อยสับสวิตช์
// ระยะนี้ Core เป็น "เงา" เท่านั้น — พังได้โดยไม่กระทบอะไรที่ร้านหากินอยู่
//
// ทำ 3 อย่าง:
//   1. syncOrders(days)   กระจกออเดอร์ช่วง N วันล่าสุด (idempotent — รันซ้ำได้ ไม่บวม)
//   2. reconYesterday()   ยามเทียบยอดเมื่อวาน ZORT vs Core → จด recon_log + เด้ง Telegram
//   3. snapshotStock()    ถ่ายสต็อกวันนี้จากแคช zort-stock ลง stock_snapshots (วันละครั้ง)
//
// ⚠️ ห้ามเขียน stock_moves จากตัว sync — รันซ้ำจะเบิ้ลรายการ
//    ยอดขายต่อ SKU อ่านจาก order_items (ลบ-เขียนใหม่ทั้งใบ = idempotent)
// ⚠️ ค่าถูกฝังใน SQL ด้วย esc() แทน bound params โดยตั้งใจ —
//    D1 จำกัดพารามิเตอร์ ~100 ตัว/คำสั่ง ถ้าใช้ params ต้องซอยก้อนเล็กจนจำนวนคำสั่ง
//    ชนเพดาน 26 วินาทีของ Netlify ตอน backfill · esc() ครอบทุกค่าที่เป็นข้อความเสมอ
import { getStore } from "@netlify/blobs";
import { coreQuery, coreReady } from "./coredb.mjs";

const BASE = "https://open-api.zortout.com/v4";
const PAGE = 200;
const MAX_PAGES = 8;

// ── เวลาไทย (UTC+7) — Netlify รัน UTC ห้ามใช้ toISOString ตรง ๆ ──
const thaiNow = () => new Date(Date.now() + 7 * 3600e3);
const ymd = (d) => d.toISOString().slice(0, 10);
const thaiDayOffset = (n) => ymd(new Date(thaiNow().getTime() - n * 864e5));

const esc = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const CANCELLED = /void|cancel|ยกเลิก/i;

function stores() {
  const out = [];
  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (ZORT_STORENAME && ZORT_APIKEY && ZORT_APISECRET) {
    out.push({ tag: "z1", storename: ZORT_STORENAME, apikey: ZORT_APIKEY, apisecret: ZORT_APISECRET });
  }
  const { ZORT_STORENAME_2, ZORT_APIKEY_2, ZORT_APISECRET_2 } = process.env;
  if (ZORT_STORENAME_2 && ZORT_APIKEY_2 && ZORT_APISECRET_2) {
    out.push({ tag: "z2", storename: ZORT_STORENAME_2, apikey: ZORT_APIKEY_2, apisecret: ZORT_APISECRET_2 });
  }
  return out;
}

// ZORT ส่งวันที่ได้หลายทรง (dd/mm/yyyy · ISO · บางทีปี พ.ศ.) — แกะแบบกันเหนียว
function orderDay(o) {
  const s = o.orderdateString || o.createdatetimeString || "";
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y > 2400) y -= 543;
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    let y = parseInt(iso[1], 10);
    if (y > 2400) y -= 543;
    return `${y}-${iso[2]}-${iso[3]}`;
  }
  return null;
}

async function fetchOrders(st, after, before) {
  const headers = { storename: st.storename, apikey: st.apikey, apisecret: st.apisecret };
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await fetch(
      `${BASE}/Order/GetOrders?orderdateafter=${after}&orderdatebefore=${before}&limit=${PAGE}&page=${page}`,
      { headers, signal: AbortSignal.timeout(12000) }
    );
    if (!r.ok) throw new Error(`zort ${st.tag} ${r.status}`);
    const d = await r.json().catch(() => ({}));
    const list = Array.isArray(d.list) ? d.list : [];
    out.push(...list);
    if (list.length < PAGE) break;
  }
  return out;
}

/** กระจกออเดอร์ N วันล่าสุด (รวมวันนี้) ลง D1 — คืนสรุปจำนวน */
export async function syncOrders(days = 3, range = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  /* ⚠️ **เติมประวัติย้อนหลังต้องแบ่งเป็นช่วง ห้ามขอทีเดียวยาว ๆ**
      งานประจำขอแค่ 3 วันจึงจบในคำขอเดียว แต่ตอนเติมย้อนหลังเป็นปี
      จำนวนหน้าจะเกินเวลาที่ Netlify ให้ฟังก์ชันรอ (26 วิ) แล้วตายกลางทาง
      ⇒ รับ from/to มาตรง ๆ แล้วให้คนเรียกไล่ทีละเดือนเอง
      รูปแบบ YYYY-MM-DD เท่านั้น · ค่าที่ไม่เข้ารูปจะถูกเมิน ไม่ใช่ตีความเอาเอง */
  const ymd = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
  const after = ymd(range.from) || thaiDayOffset(days - 1);
  const before = ymd(range.to) || thaiDayOffset(0);
  const result = { after, before, stores: {} };

  for (const st of stores()) {
    const raw = await fetchOrders(st, after, before);
    // กันซ้ำข้ามหน้า (ข้อมูลขยับระหว่างดึงได้)
    const seen = new Set();
    const orders = [];
    for (const o of raw) {
      if (!o?.number || seen.has(o.number)) continue;
      seen.add(o.number);
      orders.push(o);
    }

    // ⚠️ **เขียนเฉพาะใบที่เปลี่ยนจริง** — งานนี้วิ่ง 48 รอบ/วัน แต่ออเดอร์เก่าไม่ขยับแล้ว
    //    เดิมเขียนทับทุกใบทุกรอบ = เผาโควตาเขียนของ D1 ฟรี ๆ จนชนเพดานวันละแสนแถว
    //    (ชนจริง 2 ก.ย. 2569 แล้วคำสั่งเขียนถัดไปตายทันที — ถ้าไปชนตอนตี 1 คลังเงาจะค้างเงียบ)
    //    อ่านของเดิมมาเทียบก่อน · การอ่านถูกกว่าการเขียนมากบน D1
    const prev = new Map(
      (
        await coreQuery(
          `SELECT id, channel, status, amount, customer, order_date, tracking_no, pay_status, integration_status FROM orders
           WHERE source = ? AND order_date >= ? AND order_date <= ?`,
          [st.tag, after, before]
        )
      ).map((r) => [r.id, r])
    );
    const same = (o) => {
      const p = prev.get(`${st.tag}/${o.number}`);
      if (!p) return false;
      return (
        String(p.channel ?? "") === ((o.saleschannel || "").trim() || "POS หน้าร้าน") &&
        String(p.status ?? "") === String(o.status ?? "") &&
        num(p.amount) === num(o.amount) &&
        String(p.customer ?? "") === String(o.customername ?? "").slice(0, 120) &&
        String(p.order_date ?? "") === (orderDay(o) ?? "") &&
        // ⚠️ **ต้องเทียบเลขพัสดุด้วย** ไม่งั้นใบเก่าที่หัวใบไม่เปลี่ยนจะถูกข้ามตลอดกาล
        //    แล้วคอลัมน์ขนส่งที่เพิ่งเพิ่มจะว่างเปล่าไปเรื่อย ๆ โดยไม่มีอะไรฟ้อง
        //    (เจอแบบเดียวกันมาแล้วกับรายการสินค้าในใบซื้อ — เขียนเฉพาะใบที่เปลี่ยน
        //     ทำให้ใบที่นิ่งแล้วไม่เคยได้ข้อมูลใหม่เลยสักครั้ง)
        String(p.tracking_no ?? "") === String(o.trackingno ?? "").slice(0, 60) &&
        String(p.pay_status ?? "") === String(o.paymentstatus ?? "").slice(0, 40) &&
        // ⚠️ ต้องอยู่ในเงื่อนไขนี้ด้วย ไม่งั้นใบที่หัวใบไม่เปลี่ยนจะไม่เคยได้ค่าใหม่เลย
        String(p.integration_status ?? "") === String(o.integrationStatus ?? "").slice(0, 40)
      );
    };
    const changed = orders.filter((o) => !same(o));
    const skipped = orders.length - changed.length;

    // upsert ออเดอร์ — ฝังค่าด้วย esc() ก้อนละ 80 ใบ
    for (let i = 0; i < changed.length; i += 80) {
      const chunk = changed.slice(i, i + 80);
      const values = chunk
        .map((o) =>
          `(${esc(`${st.tag}/${o.number}`)},${esc(st.tag)},${esc(o.number)},` +
          `${esc((o.saleschannel || "").trim() || "POS หน้าร้าน")},${esc(o.status)},` +
          `${num(o.amount)},${esc(String(o.customername ?? "").slice(0, 120))},` +
          `${esc(orderDay(o) ?? "")},datetime('now'),` +
          `${esc(String(o.trackingno ?? "").slice(0, 60))},` +
          `${esc(String(o.shippingchannel ?? "").slice(0, 120))},` +
          `${esc(String(o.shippingname ?? "").slice(0, 120))},` +
          `${esc(String(o.shippingdateString ?? o.shippingdate ?? "").slice(0, 10))},` +
          `${o.isCOD ? 1 : 0},${esc(String(o.paymentstatus ?? "").slice(0, 40))},` +
          `${esc(String(o.integrationStatus ?? "").slice(0, 40))})`
        )
        .join(",");
      await coreQuery(
        `INSERT INTO orders (id,source,number,channel,status,amount,customer,order_date,updated_at,
                             tracking_no,ship_channel,ship_name,ship_date,is_cod,pay_status,integration_status)
         VALUES ${values}
         ON CONFLICT(id) DO UPDATE SET
           channel=excluded.channel, status=excluded.status, amount=excluded.amount,
           customer=excluded.customer, order_date=excluded.order_date, updated_at=excluded.updated_at,
           tracking_no=excluded.tracking_no, ship_channel=excluded.ship_channel,
           ship_name=excluded.ship_name, ship_date=excluded.ship_date, is_cod=excluded.is_cod,
           pay_status=excluded.pay_status, integration_status=excluded.integration_status`
      );
    }

    // รายการสินค้า — เขียนใหม่เฉพาะใบที่เปลี่ยน (ใบเก่าที่นิ่งแล้วไม่ต้องแตะ)
    let itemRows = 0;
    for (let i = 0; i < changed.length; i += 80) {
      const chunk = changed.slice(i, i + 80);
      const ids = chunk.map((o) => esc(`${st.tag}/${o.number}`)).join(",");
      await coreQuery(`DELETE FROM order_items WHERE order_id IN (${ids})`);
      const rows = [];
      for (const o of chunk) {
        const list = Array.isArray(o.list) ? o.list : [];
        list.forEach((it, idx) => {
          const qty = num(it.number ?? it.quantity);
          const amount = num(it.totalprice ?? num(it.pricepernumber) * qty);
          rows.push(
            `(${esc(`${st.tag}/${o.number}`)},${idx},${esc(it.sku)},` +
            `${esc(String(it.name ?? it.productname ?? "").slice(0, 200))},${qty},${amount})`
          );
        });
      }
      for (let j = 0; j < rows.length; j += 200) {
        await coreQuery(
          `INSERT INTO order_items (order_id,line,sku,name,qty,amount)
           VALUES ${rows.slice(j, j + 200).join(",")}
           ON CONFLICT(order_id,line) DO UPDATE SET sku=excluded.sku, name=excluded.name, qty=excluded.qty, amount=excluded.amount`
        );
      }
      itemRows += rows.length;
    }

    result.stores[st.tag] = { orders: orders.length, written: changed.length, skipped, items: itemRows };
  }

  /* ⚠️ **บันทึกชีพจรทุกครั้งที่วิ่งจบ ไม่ว่าจะเขียนกี่แถว** — รวมทั้งรอบที่เขียน 0
      นี่คือจุดสำคัญทั้งหมดของตัวนี้: จอต้องแยก "ข้อมูลไม่เปลี่ยนเพราะไม่มีอะไรขยับ"
      ออกจาก "ข้อมูลไม่เปลี่ยนเพราะซิงก์ตายไปแล้ว" ซึ่งหน้าตาเหมือนกันเป๊ะถ้าดูแต่ตัวเลข
      ⚠️ ห้าม await แบบที่ทำให้ทั้งรอบล้มถ้าตารางยังไม่ถูกสร้าง (ต้องยิง ?init=1 ก่อน)
         ⇒ กลืน error ทิ้ง · ชีพจรหายดีกว่าซิงก์ล้ม แต่ **ต้องกลืนแบบตั้งใจ ไม่ใช่ปล่อยลอย** */
  try {
    await coreQuery(
      `INSERT INTO core_meta (k,v,at) VALUES ('sync_orders', ?, datetime('now'))
       ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at`,
      [JSON.stringify({ after, before, stores: result.stores })]
    );
  } catch {
    // ไม่ทำอะไร — ดูคำอธิบายข้างบน
  }
  return result;
}

/** ยามเทียบยอด — เทียบเมื่อวาน ZORT (ดึงสด) vs Core (ที่กระจกไว้) แล้วเด้ง Telegram */
export async function reconYesterday() {
  if (!coreReady()) return { skip: "no token" };
  const day = thaiDayOffset(1);

  // ตัวเลขฝั่ง ZORT — ดึงสดเฉพาะวันเมื่อวาน นับแบบไม่รวมใบยกเลิก
  let zortOrders = 0;
  let zortAmount = 0;
  for (const st of stores()) {
    const raw = await fetchOrders(st, day, day);
    const seen = new Set();
    for (const o of raw) {
      if (!o?.number || seen.has(o.number)) continue;
      seen.add(o.number);
      if (CANCELLED.test(String(o.status))) continue;
      if (orderDay(o) !== day) continue;
      zortOrders += 1;
      zortAmount += num(o.amount);
    }
  }

  // ตัวเลขฝั่ง Core
  const rows = await coreQuery(
    `SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS s FROM orders
     WHERE order_date = ? AND status NOT LIKE '%cancel%' AND status NOT LIKE '%void%' AND status NOT LIKE '%ยกเลิก%'`,
    [day]
  );
  const coreOrders = num(rows[0]?.c);
  const coreAmount = num(rows[0]?.s);

  const match = coreOrders === zortOrders && Math.abs(coreAmount - zortAmount) < 1;
  const notes = match ? "ตรงกัน" : `ต่าง: ออเดอร์ ${coreOrders - zortOrders} · ยอด ${(coreAmount - zortAmount).toFixed(2)}`;
  await coreQuery(
    `INSERT INTO recon_log (day,zort_orders,zort_amount,core_orders,core_amount,diff_notes,at)
     VALUES (?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(day) DO UPDATE SET zort_orders=excluded.zort_orders, zort_amount=excluded.zort_amount,
       core_orders=excluded.core_orders, core_amount=excluded.core_amount, diff_notes=excluded.diff_notes, at=excluded.at`,
    [day, zortOrders, zortAmount, coreOrders, coreAmount, notes]
  );

  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    const icon = match ? "🪞✅" : "🪞⚠️";
    const text =
      `${icon} คลังเงา GUCUT Core — เทียบยอดเมื่อวาน (${day})\n` +
      `ZORT: ${zortOrders} ใบ · ฿${zortAmount.toLocaleString("th-TH")}\n` +
      `Core: ${coreOrders} ใบ · ฿${coreAmount.toLocaleString("th-TH")}\n` +
      (match ? "ตัวเลขตรงกัน" : `❗ ${notes} — ควรเข้าไปดู`);
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null); // เตือนพลาดไม่ควรล้มงานเทียบ — ตัวเลขจดลง recon_log แล้ว
  }
  return { day, zortOrders, zortAmount, coreOrders, coreAmount, match };
}

/** ถ่ายสต็อกวันนี้จากแคช zort-stock (ที่ products-feed กวาดไว้ทุก 30 นาที) ลง snapshot */
export async function snapshotStock() {
  if (!coreReady()) return { skip: "no token" };
  const day = thaiDayOffset(0);
  const store = getStore({ name: "gucut-coupon", consistency: "eventual" });
  const cache = await store.get("zort-stock", { type: "json" }).catch(() => null);
  const map = cache?.map;
  if (!map || typeof map !== "object") return { skip: "ไม่มีแคช zort-stock" };

  const entries = Object.entries(map);
  for (let i = 0; i < entries.length; i += 400) {
    const chunk = entries.slice(i, i + 400);
    await coreQuery(
      `INSERT INTO stock_snapshots (day,sku,qty,price)
       VALUES ${chunk.map(([sku, v]) => `(${esc(day)},${esc(sku)},${num(v?.[0])},${num(v?.[1])})`).join(",")}
       ON CONFLICT(day,sku) DO UPDATE SET qty=excluded.qty, price=excluded.price`
    );
  }
  return { day, skus: entries.length };
}
