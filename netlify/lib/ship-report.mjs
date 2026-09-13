// รายงานเช้า: ออเดอร์ค้างส่ง ⇒ รหัสที่ต้องให้พนักงานนับของจริง (งานกระดาน t_mtxjvv3u · ท่านประธานสั่ง)
//
// 🔑 **สัญญาณที่ใช้: "จ่ายแล้ว + ZORT ยังไม่ Success/ยกเลิก"** (กติกาเดียวกับ ?pending=1 กอง "ต้องส่งของ")
//    ⚠️ **ห้ามใช้ shipStatusGroup = waiting_ship เป็นสัญญาณ** — จนถึง 13 ก.ย. 2569 กองนั้นรวม Lazada `confirmed`
//       ซึ่งส่งไปแล้วทุกใบ (2,853/2,853) ⇒ สัญญาณ "00313 น่าจะหมด" เช้า 12 ก.ย. เป็นผลบวกลวงทั้งชุด
//       สถานะฝั่งแพลตฟอร์มแปลความหมายผิดได้เงียบ ๆ · สถานะเอกสาร ZORT คือสิ่งที่ร้านกดปิดเองจริง
// 🔑 **ต้องแยกอายุใบ** — กอง "ต้องส่งของ" มีใบอายุ 521-1,165 วันปนอยู่ (ใบไม่เคยปิดใน ZORT ไม่ใช่ของหมด)
//    ไม่แยก = ส่งพนักงานไปนับของเพราะเอกสารเก่าที่ไม่มีใครปิด แล้วคนจะเลิกเชื่อรายงาน
// ⚠️ อ่านอย่างเดียว · ไม่เขียน ZORT ไม่ปิดขาย — แค่บอกคนว่าต้องไปนับอะไร
import { coreQuery, coreReady } from "./coredb.mjs";

export const FRESH_DAYS = 3;  // ใบอายุต่ำกว่านี้ = ยังส่งทันตามปกติ ไม่นับว่าค้าง
export const OLD_DAYS = 60;   // เกินนี้ = ใบค้างเก่า (เอกสารไม่เคยปิด) ไม่ใช่สัญญาณของหมด
const MAX_LINES = 15;         // Telegram จำกัด 4,096 ตัวอักษร · ยาวเกินคนเลิกอ่าน

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5);

/** ฟังก์ชันล้วน — ทดสอบด้วยข้อมูลปลอมได้
 *  @param orders [{ id, number, channel, day, status }] ใบจ่ายแล้วที่ ZORT ยังไม่ปิด
 *  @param items  [{ order_id, sku, name, qty }]
 *  @param snap   Map<sku, qty> ภาพถ่ายสต็อกล่าสุด (ไม่มีในแผนที่ = ไม่รู้ ห้ามเป็น 0)
 *  @param today  "YYYY-MM-DD" วันไทย */
export function buildShipReport({ orders, items, snap, today }) {
  const fresh = [], stuck = [], old = [];
  for (const o of orders) {
    const age = dayDiff(today, String(o.day).slice(0, 10));
    const row = { ...o, age };
    if (age < FRESH_DAYS) fresh.push(row);
    else if (age > OLD_DAYS) old.push(row);
    else stuck.push(row);
  }
  const stuckAge = new Map(stuck.map((o) => [o.id, o.age]));
  const bySku = new Map();
  for (const it of items) {
    if (!stuckAge.has(it.order_id)) continue;
    const sku = String(it.sku || "").trim() || "(ไม่มีรหัส)";
    const g = bySku.get(sku) || { sku, name: it.name || "", orders: new Set(), qty: 0, oldestDays: 0 };
    g.orders.add(it.order_id);
    g.qty += num(it.qty);
    g.oldestDays = Math.max(g.oldestDays, stuckAge.get(it.order_id));
    if (!g.name && it.name) g.name = it.name;
    bySku.set(sku, g);
  }
  const skus = [...bySku.values()]
    .map((g) => ({ sku: g.sku, name: g.name, orders: g.orders.size, qty: g.qty, oldestDays: g.oldestDays, systemQty: snap.has(g.sku) ? num(snap.get(g.sku)) : null }))
    .sort((a, b) => b.oldestDays - a.oldestDays || b.orders - a.orders);
  const stuckNoItems = stuck.filter((o) => !items.some((it) => it.order_id === o.id)).length;

  const lines = [`📦 <b>รายงานเช้า · ออเดอร์จ่ายแล้วยังไม่ส่ง</b> (${today})`];
  lines.push(`ค้าง ${FRESH_DAYS}-${OLD_DAYS} วัน: <b>${stuck.length} ใบ</b> · ใหม่ (ยังไม่ถึง ${FRESH_DAYS} วัน): ${fresh.length} ใบ`);
  if (!skus.length) {
    lines.push(stuck.length ? "⚠️ มีใบค้างแต่ไม่มีรายการสินค้าในกระจก — เปิดดูใบใน ZORT" : "✅ ไม่มีรหัสที่ต้องนับวันนี้");
  } else {
    lines.push("", "<b>รหัสที่ต้องให้พนักงานนับของจริง</b> (ค้างนานสุดก่อน)");
    for (const s of skus.slice(0, MAX_LINES)) {
      const have = s.systemQty === null ? "ระบบไม่รู้จัก" : `ระบบบอกมี ${s.systemQty}`;
      lines.push(`• <code>${esc(s.sku)}</code> ${esc(String(s.name).slice(0, 40))} — ค้าง ${s.orders} ใบ · ${s.oldestDays} วัน · ${have}`);
    }
    if (skus.length > MAX_LINES) lines.push(`…และอีก ${skus.length - MAX_LINES} รหัส (ดูเต็มที่ /api/core?shipreport=1)`);
  }
  if (stuckNoItems) lines.push(`(ใบค้างที่ไม่มีรายการสินค้า ${stuckNoItems} ใบ)`);
  if (old.length) lines.push("", `🗂 ใบค้างเก่าเกิน ${OLD_DAYS} วัน ${old.length} ใบ — เอกสารไม่เคยปิดใน ZORT <b>ไม่ต้องนับของ</b> ควรปิดหรือยกเลิกใบ`);

  return {
    today,
    counts: { fresh: fresh.length, stuck: stuck.length, old: old.length, skus: skus.length, stuckNoItems },
    skus,
    oldestOld: old.length ? Math.max(...old.map((o) => o.age)) : null,
    text: lines.join("\n"),
  };
}

async function tell(text) {
  const { TELEGRAM_BOT_TOKEN: tok, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!tok || !chat) return false;
  const r = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => null);
  return Boolean(r?.ok);
}

/** send=false = ดูตัวอย่างอย่างเดียว (ใช้กับ GET ?shipreport=1) */
export async function shipReport({ send = false } = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const WHERE = `source = 'z1'
    AND status NOT LIKE '%Success%' AND status NOT LIKE '%สำเร็จ%'
    AND status NOT LIKE '%cancel%' AND status NOT LIKE '%void%' AND status NOT LIKE '%ยกเลิก%'
    AND COALESCE(pay_status,'') LIKE '%paid%'`;
  const [orders, items, dayRow] = await Promise.all([
    coreQuery(`SELECT id, number, COALESCE(NULLIF(channel,''),'(ไม่ระบุ)') AS channel, order_date AS day, status FROM orders WHERE ${WHERE}`),
    coreQuery(`SELECT order_id, sku, name, qty FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE ${WHERE})`),
    coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`),
  ]);
  const day = dayRow?.[0]?.d;
  const snap = new Map(
    day ? (await coreQuery(`SELECT sku, qty FROM stock_snapshots WHERE day = ?`, [day])).map((r) => [String(r.sku).trim(), num(r.qty)]) : []
  );
  const rep = buildShipReport({ orders, items, snap, today });
  const sent = send ? await tell(rep.text) : null;
  return { ...rep, stockDay: day || null, sent };
}
