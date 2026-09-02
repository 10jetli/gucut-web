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
    `SELECT id, source, number, channel, status, amount, customer, order_date
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
    `SELECT id, source, number, channel, status, amount, customer, order_date, updated_at
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
