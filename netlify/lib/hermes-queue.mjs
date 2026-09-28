/* คิวคำสั่งจากแว่น → Hermes บน g1 (28 ก.ย. 2569)
 *
 * 🔑 **ทำไมต้องเป็นคิวแบบให้ g1 มาถาม ไม่ใช่ยิงตรงไปหา g1**
 *    g1 เป็นเครื่องที่บ้าน ไม่มีชื่อโดเมนที่เน็ตนอกยิงเข้าได้ และเปิด/ปิดตามไฟบ้าน
 *    ⇒ กลับทิศ: แว่นฝากงานไว้ที่เว็บ · g1 วิ่งมาถามเอง ⇒ **ไม่ต้องเปิดช่องเข้าเครื่องที่บ้านเลย**
 *
 * 🔴 **ที่มาที่ต้องจดไว้**: ฝั่งรับบน g1 (`~/bin/รับคำสั่งจากแว่น.py`) เขียนเสร็จตั้งแต่ 28 ก.ย. 06:02
 *    และเรียก `?hermesq=claim` / `?hermesq=1` มาตลอด **แต่ฝั่งท่อไม่เคยมีเส้นนี้เลย**
 *    ⇒ `/api/core` ที่ไม่รู้จักพารามิเตอร์จะตกไปที่ "คำตอบหน้าแรก" พร้อม **HTTP 200**
 *    ⇒ ⇒ ตัวรับบน g1 จึงได้ 200 ทุกครั้ง อ่าน `งาน` ไม่เจอ แล้ว **เงียบเหมือนไม่มีงาน ตลอดกาล**
 *    🔑 คลาสที่เราเจอซ้ำทั้งสัปดาห์: **ฝั่งหนึ่งเสร็จ อีกฝั่งไม่มี แล้วผลลัพธ์หน้าตาเหมือนทำงานปกติ**
 *       (ใบงานบนกระดานเขียนว่า "เขียนเสร็จ รอ push" ทั้งที่ของฝั่งนี้ไม่เคยมีใน git เลยสักบรรทัด)
 */
import { coreQuery, coreReady } from "./coredb.mjs";
import { แถวจากผล } from "./coredb.mjs";

/** อายุสูงสุดของใบที่ถูกหยิบไปแล้วแต่ยังไม่ปิด — เกินนี้ถือว่าเครื่องหยิบไปแล้วตาย ⇒ ให้หยิบซ้ำได้
 *  ⚠️ ต้องยาวกว่าเวลาที่ Hermes ใช้จริง (ตัวรับตั้ง timeout ของตัวเองไว้) ไม่งั้นงานเดียวถูกทำสองรอบ */
export const หมดอายุการหยิบ_นาที = 20;

async function สร้างตาราง() {
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS hermes_queue (
       id TEXT PRIMARY KEY, cmd TEXT NOT NULL, who TEXT,
       at TEXT DEFAULT (datetime('now')),
       claimed_at TEXT, done_at TEXT, result TEXT)`
  );
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_hq_open ON hermes_queue(done_at, claimed_at)`);
}

/** ฝากคำสั่งเข้าคิว — คืน id ที่ใช้ตามผลได้ */
export async function ฝากงานแว่น({ cmd, who = null } = {}) {
  const ข้อความ = String(cmd ?? "").trim();
  if (!ข้อความ) return { error: "ไม่มีคำสั่ง (cmd ว่าง)" };
  if (!coreReady()) return { skip: "ยังต่อฐานคลังเงาไม่ได้" };
  await สร้างตาราง();
  const id = `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await coreQuery(`INSERT INTO hermes_queue (id, cmd, who) VALUES (?,?,?)`,
    [id, ข้อความ.slice(0, 2000), who ? String(who).slice(0, 60) : null]);
  return { ok: true, id, คิว: await จำนวนที่รออยู่() };
}

async function จำนวนที่รออยู่() {
  const r = แถวจากผล(await coreQuery(
    `SELECT COUNT(*) AS n FROM hermes_queue WHERE done_at IS NULL`), "นับใบที่ยังไม่จบ");
  return Number(r[0]?.n ?? 0);
}

/** g1 มาขอใบถัดไป — หยิบได้ทีละใบ
 *  ⚠️ **ต้องติดธงว่าถูกหยิบแล้วทันที** ไม่งั้นตัวรับสองตัว (หรือรอบซ้อน) หยิบใบเดียวกัน
 *     ⇒ Hermes ทำงานซ้ำ และผลเข้า Telegram สองรอบ */
export async function ขอใบถัดไป() {
  if (!coreReady()) return { skip: "ยังต่อฐานคลังเงาไม่ได้" };
  await สร้างตาราง();
  const แถว = แถวจากผล(await coreQuery(
    `SELECT id, cmd FROM hermes_queue
      WHERE done_at IS NULL
        AND (claimed_at IS NULL OR claimed_at < datetime('now', ?))
      ORDER BY at LIMIT 1`, [`-${หมดอายุการหยิบ_นาที} minutes`]), "หยิบใบถัดไป");
  const ใบ = แถว[0];
  if (!ใบ) return { ok: true, งาน: null, คิว: 0 };
  await coreQuery(`UPDATE hermes_queue SET claimed_at = datetime('now') WHERE id = ?`, [ใบ.id]);
  return { ok: true, งาน: { id: ใบ.id, cmd: ใบ.cmd }, คิว: await จำนวนที่รออยู่() };
}

/** g1 ปิดใบ พร้อมผลย่อ
 *  🔑 ปิดใบที่ไม่มีอยู่ **ต้องบอกตรง ๆ ว่าไม่เจอ** ไม่ใช่ตอบ ok
 *     (ตัวรับใช้คำตอบนี้ตัดสินว่าจะเตือนว่า "อาจถูกหยิบซ้ำ" หรือไม่) */
export async function ปิดใบ({ id, ผล } = {}) {
  const รหัส = String(id ?? "").trim();
  if (!รหัส) return { error: "ไม่มี id" };
  if (!coreReady()) return { skip: "ยังต่อฐานคลังเงาไม่ได้" };
  await สร้างตาราง();
  const มี = แถวจากผล(await coreQuery(
    `SELECT id, done_at FROM hermes_queue WHERE id = ?`, [รหัส]), "หาใบที่จะปิด");
  if (!มี.length) return { ok: false, error: "ไม่พบใบนี้ในคิว", id: รหัส };
  if (มี[0].done_at) return { ok: true, ปิดอยู่แล้ว: true, id: รหัส };
  await coreQuery(
    `UPDATE hermes_queue SET done_at = datetime('now'), result = ? WHERE id = ?`,
    [String(ผล ?? "").slice(0, 2000), รหัส]);
  return { ok: true, id: รหัส, คิว: await จำนวนที่รออยู่() };
}

/** ส่องคิว (ให้คนดู ไม่ใช่ให้เครื่องหยิบ) */
export async function ส่องคิว({ limit = 20 } = {}) {
  if (!coreReady()) return { skip: "ยังต่อฐานคลังเงาไม่ได้" };
  await สร้างตาราง();
  const n = Math.max(1, Math.min(100, Number(limit) || 20));
  const rows = แถวจากผล(await coreQuery(
    `SELECT id, cmd, who, at, claimed_at, done_at, substr(COALESCE(result,''),1,160) AS ผลย่อ
       FROM hermes_queue ORDER BY at DESC LIMIT ?`, [n]), "ส่องคิว");
  return {
    ok: true,
    ขอบเขต: `ใบล่าสุด ${rows.length} ใบ (ทั้งที่จบแล้วและยังไม่จบ)`,
    รออยู่: await จำนวนที่รออยู่(),
    "⏱️ ใบที่ถูกหยิบแล้วเกินกี่นาทีถือว่าเครื่องตาย": หมดอายุการหยิบ_นาที,
    rows,
  };
}
