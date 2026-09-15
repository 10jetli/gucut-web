/* ══ มูลค่าสินค้าคงเหลือ + เคลื่อนไหวล่าสุด "ต่อคลัง" ที่คัดมาจากจอ ZORT ══════════════
   ⚠️ **ZORT API ไม่มีข้อมูลนี้** (15 ก.ย. 2569) — เอกสาร Warehouse/GetWarehouses มีแค่ id/name/code/address
      และกวาด GET ไม่ใส่รหัส 264 คู่ (Warehouse·Stock·Inventory·Report × Get/List × 22 ชื่อ) เจอแค่ GetWarehouses
      ⇒ ค่านี้อยู่แต่บนจอ ZORT `/Warehouse/list` ⇒ ตัวคัดบน g1 อ่านจอ (อ่านอย่างเดียว) แล้ว POST ?warehousevalues
   ⚠️ **มูลค่าของ ZORT = ต้นทุนเฉลี่ย** — ห้ามคิดแทนจาก buy×qty (ต่ำไป 34%) หรือ price×qty (สูงไป 62%) · ฝั่งจอวัดไว้
   ⚠️ **ค่าที่ "คัดมา" ขยับทั้งวัน** (NEW 16,306,984.11 → 16,305,522.84 ในวันเดียว) ⇒ ส่ง collectedAt ดิบทุกแถว
      จอคิดเองว่าเก่าแค่ไหน (กฎ computed-now-goes-stale) · ไม่มีค่า = null ห้ามเป็น 0 */
import { coreQuery, coreReady } from "./coredb.mjs";

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "15 ก.ย. 2569 11:48" (เวลาไทย · ปี พ.ศ.) → "2026-09-15T11:48:00+07:00" · อ่านไม่ได้ = null (ห้ามเดา)
 *  ⚠️ **ส่งเป็น ISO มีเขตเวลา +07:00 ไม่ใช่ UTC แบบ Z** — จอสาขาแสดงวันด้วย `String(movedAt).slice(0, 10)`
 *     ถ้าเป็น Z การเคลื่อนไหวช่วง 00:00–06:59 เวลาไทยจะโชว์เป็นเมื่อวาน · รูป +07:00 สิบตัวแรกคือวันไทยพอดี
 *     และยังเป็นเวลาที่แน่นอน (Date.parse แปลงเป็น UTC ได้ถูก) */
export function parseThaiDateTime(raw) {
  const m = String(raw ?? "").trim().match(/^(\d{1,2})\s+(\S+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  const mon = TH_MONTHS.indexOf(m[2]);
  const day = Number(m[1]), yearBE = Number(m[3]);
  const hh = m[4] === undefined ? 0 : Number(m[4]), mm = m[5] === undefined ? 0 : Number(m[5]);
  if (mon < 0 || yearBE < 2500 || day < 1 || day > 31 || hh > 23 || mm > 59) return null;
  // วันที่ไม่มีจริง (31 ก.พ.) ⇒ Date เลื่อนเดือนให้เงียบ ๆ — ต้องจับ
  const local = new Date(Date.UTC(yearBE - 543, mon, day, hh, mm));
  if (local.getUTCDate() !== day || local.getUTCMonth() !== mon) return null;
  const p2 = (n) => String(n).padStart(2, "0");
  return `${yearBE - 543}-${p2(mon + 1)}-${p2(day)}T${p2(hh)}:${p2(mm)}:00+07:00`;
}

/** "16,305,522.84" → 16305522.84 · "0" → 0 · ว่าง/มีตัวอื่นปน = null */
export function parseZortNumber(raw) {
  const s = String(raw ?? "").trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const CODE_RE = /^[A-Za-z0-9_-]{1,20}$/;

/** ขาเข้า: rows [{ code, value: "16,305,522.84", lastMovement: "15 ก.ย. 2569 11:48", readAt? }]
 *  🔴 ผ่านทุกแถวถึงเขียน — แถวเสียแถวเดียว = ไม่เขียนเลย (ห้ามเขียนครึ่งชุดแล้วจอเห็นว่าครบ) */
export async function saveWarehouseValues(rows) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const list = Array.isArray(rows) ? rows : null;
  if (!list || !list.length) return { error: "ต้องส่ง rows อย่างน้อย 1 แถว" };
  if (list.length > 50) return { error: "rows เกิน 50 แถว" };
  const clean = [], bad = [];
  const seen = new Set();
  for (const [i, r] of list.entries()) {
    const code = String(r?.code ?? "").trim();
    const value = parseZortNumber(r?.value);
    const lastMovementAt = String(r?.lastMovement ?? "").trim() === "" ? null : parseThaiDateTime(r?.lastMovement);
    const why = !CODE_RE.test(code) ? "รหัสคลังไม่ถูกรูป"
      : seen.has(code) ? "รหัสคลังซ้ำ"
      : value === null ? "อ่านมูลค่าไม่ได้"
      : (String(r?.lastMovement ?? "").trim() !== "" && lastMovementAt === null) ? "อ่านวันเคลื่อนไหวล่าสุดไม่ได้"
      : null;
    if (why) { bad.push({ row: i, code: code.slice(0, 20), why }); continue; }
    seen.add(code);
    clean.push({ code, value, lastMovementAt });
  }
  if (bad.length) return { error: `มีแถวที่ใช้ไม่ได้ ${bad.length} แถว — ไม่ได้บันทึกอะไร`, bad: bad.slice(0, 10) };
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS warehouse_values (
       code TEXT PRIMARY KEY, value REAL NOT NULL, last_movement_at TEXT, collected_at TEXT NOT NULL)`
  );
  for (const r of clean) {
    await coreQuery(
      `INSERT INTO warehouse_values (code, value, last_movement_at, collected_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(code) DO UPDATE SET value=excluded.value, last_movement_at=excluded.last_movement_at, collected_at=excluded.collected_at`,
      [r.code, r.value, r.lastMovementAt]
    );
  }
  return { saved: clean.length, total: Math.round(clean.reduce((s, r) => s + r.value, 0) * 100) / 100 };
}

/** คืน Map code → { value, lastMovementAt, collectedAtUtc } · ยังไม่เคยคัด (ไม่มีตาราง) = Map ว่าง
 *  🔴 อ่านพลาดด้วยเหตุอื่น ⇒ throw — ห้ามกลืนเป็น "ไม่มีค่า" (สามสถานะ) */
export async function warehouseValues() {
  if (!coreReady()) return new Map();
  let rows;
  try {
    rows = await coreQuery(`SELECT code, value, last_movement_at, collected_at FROM warehouse_values`);
  } catch (e) {
    if (/no such table/i.test(String(e?.message ?? e))) return new Map();
    throw e;
  }
  return new Map(rows.map((r) => [String(r.code), {
    value: Number(r.value),
    lastMovementAt: r.last_movement_at ?? null,
    collectedAtUtc: r.collected_at ?? null,
  }]));
}
