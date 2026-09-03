// คลังเงา GUCUT Core — จอ "รายการขาย" อ่านจากฐานของเราเอง (ไม่แตะ ZORT เลย)
//
// จอนี้คือตัวแทนหน้า "รายการขาย" ของ ZORT ซึ่งเป็นหน้าที่ร้านเปิดบ่อยที่สุด
// หน้าเดิมใน admin.gucut.com (/orders · /sales) ยิงไป ZORT ตรง ๆ — ตัด ZORT เมื่อไหร่จอเปล่าทันที
// ตัวนี้อ่านจาก D1 ล้วน จึงเป็นจอแรกที่ "อยู่ได้โดยไม่มี ZORT"
//
// ⚠️ อ่านอย่างเดียวทั้งไฟล์ — ห้ามเพิ่มคำสั่งเขียนลงมาปนที่นี่
//    ระยะนี้คลังเงายังเป็นเงา ข้อมูลจริงคือ ZORT · เขียนได้เมื่อไหร่ค่อยแยกไฟล์ใหม่
// ⚠️ ค่าจากผู้ใช้ผูกด้วย ? เสมอ (ไม่ใช่ esc()) — ตัวเลขน้อย ไม่ชนเพดาน ~100 params ของ D1
//    ต่างจากตัว sync ที่ยัดทีละร้อยแถวจนต้องฝังค่า
import { coreQuery, coreReady } from "./coredb.mjs";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const CANCEL_SQL =
  `status NOT LIKE '%cancel%' AND status NOT LIKE '%void%' AND status NOT LIKE '%ยกเลิก%'`;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const thaiToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const daysAgo = (n) =>
  new Date(Date.now() + 7 * 3600e3 - n * 864e5).toISOString().slice(0, 10);

/** ตัวกรองที่ใช้ร่วมกันทั้งตัวนับและตัวดึงแถว */
function buildWhere({ from, to, channel, status, q, includeCancelled }) {
  const where = ["order_date >= ?", "order_date <= ?"];
  const params = [from, to];
  if (channel) {
    where.push("channel = ?");
    params.push(channel);
  }
  // กรองตามสถานะ — จอฝั่งเราทำแท็บสถานะแบบ ZORT (ทั้งหมด/รอโอน/สำเร็จ/ยกเลิก)
  // ⚠️ เทียบแบบตรงตัวเท่านั้น ไม่ใช้ LIKE — ค่าที่มาจากตัวเลือกบนจอ ไม่ใช่คำค้นอิสระ
  //    ใช้ LIKE เมื่อไหร่ "Success" จะไปลากคำอื่นที่มีคำนี้ประกอบมาด้วยแบบเงียบ ๆ
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (q) {
    where.push("(number LIKE ? OR customer LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (!includeCancelled) where.push(CANCEL_SQL);
  return { sql: where.join(" AND "), params };
}

/**
 * รายการขายจากคลังเงา
 * @param {object} o from · to (YYYY-MM-DD) · channel · status · q (เลขที่/ชื่อลูกค้า) ·
 *                   limit · offset · includeCancelled
 */
export async function listOrders(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };

  // วันที่ต้องเป็นรูป YYYY-MM-DD เท่านั้น — ค่าเพี้ยนให้ถอยไปช่วงปลอดภัย ไม่ใช่ปล่อยผ่าน
  const to = DAY.test(String(o.to)) ? o.to : thaiToday();
  const from = DAY.test(String(o.from)) ? o.from : daysAgo(30);
  const limit = Math.max(1, Math.min(200, num(o.limit) || 50));
  const offset = Math.max(0, num(o.offset));
  const channel = String(o.channel ?? "").slice(0, 60) || null;
  const status = String(o.status ?? "").slice(0, 60) || null;
  const q = String(o.q ?? "").trim().slice(0, 60) || null;
  const includeCancelled = !!o.includeCancelled;

  const w = buildWhere({ from, to, channel, status, q, includeCancelled });

  const [sum] = await coreQuery(
    `SELECT COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS s
     FROM orders WHERE ${w.sql}`,
    w.params
  );
  const rows = await coreQuery(
    `SELECT id, source, number, channel, status, amount, customer, order_date, tracking_no, ship_channel, ship_name, ship_date, is_cod, pay_status
     FROM orders WHERE ${w.sql}
     ORDER BY order_date DESC, number DESC
     LIMIT ${limit} OFFSET ${offset}`,
    w.params
  );

  // ยอดแยกช่องทางของ "ช่วงที่กรองอยู่" — ZORT ไม่มีให้ดูในจอเดียว แต่ร้านถามบ่อย
  const byChannel = await coreQuery(
    `SELECT channel, COUNT(*) AS orders, ROUND(COALESCE(SUM(amount),0),2) AS amount
     FROM orders WHERE ${w.sql}
     GROUP BY channel ORDER BY amount DESC`,
    w.params
  );

  // ยอดแยก "สถานะ" ของช่วงที่กรองอยู่ — จอเอาไปทำแท็บพร้อมจำนวนในวงเล็บแบบ ZORT
  // ⚠️ ไม่กรองตามสถานะที่เลือกอยู่ ไม่งั้นแท็บอื่นจะกลายเป็นศูนย์หมดทันทีที่กดแท็บแรก
  //    (แท็บต้องบอกได้เสมอว่าแท็บอื่นมีกี่ใบ ไม่งั้นมันไม่ใช่แท็บ เป็นแค่ปุ่มกรอง)
  // ⚠️ **นับใบยกเลิกด้วยเสมอ** ไม่ว่าตัวกรองหลักจะรวมหรือไม่ —
  //    ไม่งั้นแท็บ "ยกเลิก" จะหายไปจากจอทั้งที่มีอยู่จริง (เจอจริง 2 ก.ย. 2569:
  //    มี Voided 44 ใบ แต่จอไม่มีแท็บให้กดเลย เพราะ byStatus ถูกกรองทิ้งไปก่อน)
  //    แท็บคือ "สารบัญ" ของข้อมูลทั้งหมด ไม่ใช่ผลของตัวกรองที่เลือกอยู่
  const wAll = buildWhere({ from, to, channel, q, includeCancelled: true });
  const byStatus = await coreQuery(
    `SELECT status, COUNT(*) AS orders, ROUND(COALESCE(SUM(amount),0),2) AS amount
     FROM orders WHERE ${wAll.sql}
     GROUP BY status ORDER BY orders DESC`,
    wAll.params
  );

  return {
    from,
    to,
    limit,
    offset,
    status,
    total: num(sum?.c),
    totalAmount: num(sum?.s),
    byChannel,
    byStatus,
    rows,
  };
}

/** ใบเดียวพร้อมรายการสินค้า (ไว้กดดูรายละเอียดจากรายการขาย) */
export async function getOrder(id) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const key = String(id ?? "").slice(0, 80);
  if (!key) return { error: "ไม่ได้ระบุเลขใบ" };
  const [order] = await coreQuery(
    `SELECT id, source, number, channel, status, amount, customer, order_date, tracking_no, ship_channel, ship_name, ship_date, is_cod, pay_status, updated_at
     FROM orders WHERE id = ?`,
    [key]
  );
  if (!order) return { error: "ไม่พบใบนี้ในคลังเงา" };
  const items = await coreQuery(
    `SELECT line, sku, name, qty, amount FROM order_items
     WHERE order_id = ? ORDER BY line`,
    [key]
  );
  return { order, items };
}

/** รายชื่อช่องทางทั้งหมดที่เคยเห็น — ไว้ทำตัวเลือกในกล่องกรอง */
export async function listChannels() {
  if (!coreReady()) return [];
  const rows = await coreQuery(
    `SELECT channel, COUNT(*) AS orders FROM orders
     WHERE channel IS NOT NULL AND channel <> ''
     GROUP BY channel ORDER BY orders DESC LIMIT 40`
  );
  return rows.map((r) => r.channel);
}

/** จอ "บริการส่งสินค้า" แบบ ZORT — เลขพัสดุ · วันที่ · ผู้รับ · ขนส่ง · สถานะ · เลขออเดอร์
 *
 *  ⚠️ **ZORT ไม่มี endpoint ขนส่งแยก** (Logistic · Shipping · Delivery ตอบ 404 ทั้งหมด)
 *     แต่ใบขายมี 114 ฟิลด์ รวมข้อมูลขนส่งครบ ⇒ อ่านจากกระจกออเดอร์ที่มีอยู่แล้ว
 *     ไม่ต้องยิง ZORT เพิ่มแม้แต่ครั้งเดียว
 *  ⚠️ **ใบที่ยังไม่มีเลขพัสดุ ไม่ใช่ "ข้อมูลหาย"** — คือยังไม่ได้ส่งของ
 *     จอต้องแยกสองอย่างนี้ ห้ามรวมเป็นช่องว่างเหมือนกัน
 */
export async function listLogistics(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const limit = Math.max(1, Math.min(200, num(o.limit) || 50));
  const offset = Math.max(0, num(o.offset));
  const q = String(o.q ?? "").trim().slice(0, 60);
  const parts = [];
  const params = [];
  if (q) {
    parts.push(`(tracking_no LIKE ? OR number LIKE ? OR ship_name LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  /* ⚠️ **ขอบเขตของจอนี้คือ "ใบที่มีการส่งของ" ไม่ใช่ออเดอร์ทั้งหมด**
      รอบแรกผมกวาดทุกแถวในตาราง orders มาแสดง = 12,127 ใบ ทั้งที่ ZORT มี 1,644
      เพราะในนั้นมีใบรับของ (RC-*) และออเดอร์เก่าที่ไม่เคยมีการส่งปนมาด้วย
      ⇒ นับเฉพาะใบที่มีร่องรอยการส่งจริง (มีเลขพัสดุ หรือระบุขนส่งไว้) */
  const SCOPE = `(COALESCE(tracking_no,'') <> '' OR COALESCE(ship_channel,'') <> '')`;
  parts.push(SCOPE);
  // แท็บ: ส่งแล้ว / ยังไม่ได้ส่ง — ตัดสินจาก "มีเลขพัสดุหรือยัง"
  const only = { shipped: `COALESCE(tracking_no,'') <> ''`, unshipped: `COALESCE(tracking_no,'') = ''` }[o.only];
  const where = [...parts, ...(only ? [only] : [])].join(" AND ") || "1=1";
  const whereNoTab = parts.join(" AND ") || "1=1";

  // ⚠️ ตัวเลขบนแท็บต้องนับข้ามตัวกรองแท็บเสมอ (กติกาเดียวกับทุกจอ)
  const [sum] = await coreQuery(
    `SELECT COUNT(*) AS c,
            SUM(CASE WHEN COALESCE(tracking_no,'') <> '' THEN 1 ELSE 0 END) AS shipped,
            SUM(CASE WHEN COALESCE(tracking_no,'') = '' THEN 1 ELSE 0 END) AS unshipped,
            SUM(CASE WHEN COALESCE(is_cod,0) = 1 THEN 1 ELSE 0 END) AS cod
     FROM orders WHERE ${whereNoTab}`,
    params
  );
  const byChannel = await coreQuery(
    `SELECT COALESCE(NULLIF(ship_channel,''),'(ยังไม่ระบุขนส่ง)') AS channel, COUNT(*) AS c
     FROM orders WHERE ${whereNoTab}
     GROUP BY COALESCE(NULLIF(ship_channel,''),'(ยังไม่ระบุขนส่ง)') ORDER BY c DESC LIMIT 20`,
    params
  );
  const rows = await coreQuery(
    `SELECT o.id AS id, o.number AS number, o.tracking_no AS trackingNo,
            COALESCE(NULLIF(o.ship_date,''), o.order_date) AS date,
            o.ship_name AS receiver, o.ship_channel AS carrier, o.status AS status,
            COALESCE(o.is_cod,0) AS isCod,
            (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS lines
     FROM orders o WHERE ${where}
     ORDER BY COALESCE(NULLIF(o.ship_date,''), o.order_date) DESC, o.number DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  return {
    total: num(sum?.c),
    shipped: num(sum?.shipped),
    unshipped: num(sum?.unshipped),
    cod: num(sum?.cod),
    limit,
    offset,
    only: o.only || null,
    byChannel,
    // ⚠️ **จอต้องบอกขอบเขตให้ชัด** ตัวเลขนี้ยังน้อยกว่าที่ ZORT แสดง (1,644 ใบ)
    //    เพราะเราเพิ่งเริ่มเก็บเลขพัสดุ ใบเก่าที่หัวใบไม่เปลี่ยนแล้วจึงยังไม่มีค่า
    //    ⇒ เขียนว่า "เท่าที่เก็บได้" ห้ามเขียนว่าเป็นทั้งหมด
    coversFrom: "เริ่มเก็บข้อมูลขนส่ง 3 ก.ย. 2569",
    zortShows: 1644,
    note:
      "อ่านจากกระจกออเดอร์ — ZORT ไม่มี API ขนส่งแยก · " +
      "นับเฉพาะใบที่มีร่องรอยการส่ง (มีเลขพัสดุหรือระบุขนส่ง) ไม่ใช่ออเดอร์ทั้งหมด · " +
      "ยังน้อยกว่าที่ ZORT แสดงเพราะใบเก่าที่ไม่ขยับแล้วยังไม่ถูกเก็บเลขพัสดุ",
    rows: rows.map((r) => ({ ...r, isCod: num(r.isCod) === 1 })),
  };
}
