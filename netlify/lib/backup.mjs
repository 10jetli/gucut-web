// สำรองข้อมูลที่ "มีอยู่ที่เดียวในโลก" — จาก Netlify Blobs ไปเก็บไว้ใน Cloudflare D1
//
// เจ้าของร้านสั่ง 3 ก.ย. 2569: "ห้ามข้อมูลหาย · มีระบบสำรอง เรียกคืนได้ถ้ามีอะไรผิดพลาด"
//
// ทำไมต้องข้ามเจ้า: Blobs กับ D1 เป็นคนละบริษัท คนละบัญชี คนละคีย์
// พังพร้อมกันหรือถูกลบพร้อมกันได้ยากกว่าเก็บสองที่ในเจ้าเดียวกันมาก
// และ D1 ของ Cloudflare ย้อนเวลาได้เอง 30 วัน ⇒ สำเนานี้ย้อนเวลาได้ด้วยโดยไม่ต้องทำอะไรเพิ่ม
//
// ⚠️ **กฎเหล็กข้อเดียวของไฟล์นี้: สำเนาต้องไม่ลบตาม**
//    คีย์ที่หายไปจากต้นทางจะถูกติดธง gone_at ไว้เฉย ๆ **ห้ามลบแถวทิ้ง**
//    ถ้าสำเนาลบตามต้นทาง มันไม่ใช่การสำรอง มันคือกระจก — แล้ววันที่ลบผิด
//    มันจะลบตามให้เรียบร้อยภายในคืนเดียวโดยไม่มีใครทัน
//
// ⚠️ **ของบางอย่างห้ามสำรองเด็ดขาด** — ดูรายการ NEVER ข้างล่าง
//    หน้าเว็บประกาศกับลูกค้าว่าเก็บ 7 วันแล้วลบ · เอามาสำรองไว้ = ผิดคำประกาศของร้านเอง
//    ความปลอดภัยของข้อมูลไม่ได้แปลว่าเก็บทุกอย่างให้นานที่สุด
import { getStore } from "@netlify/blobs";
import { coreQuery, coreReady } from "./coredb.mjs";

const esc = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** ถังที่ต้องสำรอง — เกณฑ์: หายแล้วสร้างใหม่ไม่ได้จากที่อื่น */
export const PROTECTED = [
  { store: "gucut-orders", what: "ออเดอร์หน้าเว็บ", skip: ["slip/"] }, // สลิปเป็นรูป ข้ามไปก่อน
  { store: "gucut-users", what: "บัญชีลูกค้า + การผูกโซเชียล" },
  { store: "gucut-staff", what: "พนักงานและการลงเวลา", skip: ["ph/"] }, // ph/ = รูปตอนลงเวลา
  { store: "gucut-coupon", what: "โค้ดส่วนลด · พิกเซล · กติกาบอต" },
  { store: "gucut-social", what: "หัวใจ · คอมเมนต์ใต้คลิป" },
  { store: "gucut-chat", what: "ห้องแชทลูกค้า" },
  { store: "gucut-reviews", what: "รีวิวที่รอเข้าเว็บ" },
  { store: "gucut-clips", what: "คลิปที่เลือกโชว์ + การผูกสินค้า" },
  { store: "gucut-admin", what: "ค่าตั้งหลังร้าน" },
  { store: "gucut-permits", what: "ใบ ลซ.๒ ที่ลูกค้าส่งมา", skip: ["img/", "sl/"] },
];

/** ห้ามสำรอง — เขียนเหตุผลกำกับไว้ทุกตัว ห้ามเพิ่มเข้ามาโดยไม่คิด */
export const NEVER = [
  { store: "gucut-idscan", why: "รูปบัตรประชาชน — หน้าเว็บประกาศว่าเก็บ 7 วันแล้วลบ สำรองไว้ = ผิดคำประกาศ" },
  { store: "gucut-live", why: "คนออนไลน์ตอนนี้ — ของชั่วคราว ผ่านไปแล้วไม่มีความหมาย" },
  { store: "gucut-time", why: "รวมอยู่ใน gucut-staff แล้ว" },
];

// ค่าเดียวที่ใหญ่เกินนี้ข้ามไป (รูป/ไฟล์แนบ) — D1 ไม่ได้ออกแบบมาเก็บไฟล์
const MAX_ONE = 180_000;
const BATCH_BYTES = 60_000;

export async function ensureBackupTables() {
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS backups (
       store TEXT NOT NULL, key TEXT NOT NULL, body TEXT, bytes INTEGER,
       at TEXT, gone_at TEXT, PRIMARY KEY (store, key))`
  );
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS backup_log (
       at TEXT, store TEXT, saved INTEGER, unchanged INTEGER,
       skipped INTEGER, gone INTEGER, bytes INTEGER)`
  );
}

/** สำรองถังเดียว */
async function backupOne(cfg) {
  const s = getStore(cfg.store);
  const { blobs } = await s.list();
  const keys = (blobs || [])
    .map((b) => b.key)
    .filter((k) => !(cfg.skip || []).some((p) => k.startsWith(p)));

  const prev = new Map(
    (await coreQuery(`SELECT key, bytes, gone_at FROM backups WHERE store = ${esc(cfg.store)}`)).map(
      (r) => [r.key, r]
    )
  );

  let saved = 0, unchanged = 0, skipped = 0, bytes = 0;
  let batch = [], batchBytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    await coreQuery(
      `INSERT INTO backups (store,key,body,bytes,at,gone_at) VALUES ${batch.join(",")}
       ON CONFLICT(store,key) DO UPDATE SET body=excluded.body, bytes=excluded.bytes,
         at=excluded.at, gone_at=NULL`
    );
    batch = [];
    batchBytes = 0;
  };

  for (const key of keys) {
    let body;
    try {
      body = await s.get(key);
    } catch {
      skipped++;
      continue;
    }
    if (body == null) continue;
    const text = typeof body === "string" ? body : JSON.stringify(body);
    const size = text.length;
    if (size > MAX_ONE) {
      skipped++;
      continue;
    }
    const p = prev.get(key);
    // เขียนเฉพาะที่เปลี่ยนจริง — ประหยัดโควตาเขียนของ D1
    // (ขนาดเท่าเดิมและไม่เคยหายไป = ถือว่าเหมือนเดิม)
    if (p && num(p.bytes) === size && !p.gone_at) {
      unchanged++;
      bytes += size;
      continue;
    }
    batch.push(`(${esc(cfg.store)},${esc(key)},${esc(text)},${size},datetime('now'),NULL)`);
    batchBytes += size;
    saved++;
    bytes += size;
    if (batchBytes >= BATCH_BYTES) await flush();
  }
  await flush();

  // คีย์ที่หายไปจากต้นทาง — ติดธงไว้ **ห้ามลบแถว**
  const live = new Set(keys);
  const vanished = [...prev.keys()].filter((k) => live.has(k) === false && !prev.get(k).gone_at);
  for (let i = 0; i < vanished.length; i += 40) {
    const chunk = vanished.slice(i, i + 40).map(esc).join(",");
    await coreQuery(
      `UPDATE backups SET gone_at = datetime('now')
       WHERE store = ${esc(cfg.store)} AND key IN (${chunk})`
    );
  }

  await coreQuery(
    `INSERT INTO backup_log (at,store,saved,unchanged,skipped,gone,bytes)
     VALUES (datetime('now'),${esc(cfg.store)},${saved},${unchanged},${skipped},${vanished.length},${bytes})`
  );
  return { store: cfg.store, what: cfg.what, keys: keys.length, saved, unchanged, skipped, gone: vanished.length, bytes };
}

/** สำรองทุกถังที่คุ้มครอง */
export async function runBackup() {
  if (!coreReady()) return { error: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  await ensureBackupTables();
  const out = [];
  for (const cfg of PROTECTED) {
    try {
      out.push(await backupOne(cfg));
    } catch (e) {
      // ถังเดียวพังต้องไม่ล้มทั้งรอบ — ถังที่เหลือยังต้องได้สำรอง
      out.push({ store: cfg.store, what: cfg.what, error: String(e?.message || e).slice(0, 160) });
    }
  }
  return {
    stores: out,
    totals: {
      saved: out.reduce((s, r) => s + num(r.saved), 0),
      keys: out.reduce((s, r) => s + num(r.keys), 0),
      bytes: out.reduce((s, r) => s + num(r.bytes), 0),
      failed: out.filter((r) => r.error).length,
    },
    never: NEVER,
  };
}

/** สรุปสถานะสำเนา — เอาไปโชว์ในหน้าสถานะระบบ */
export async function backupStatus() {
  if (!coreReady()) return { ready: false, why: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  await ensureBackupTables();
  const rows = await coreQuery(
    `SELECT store, COUNT(*) AS keys, SUM(bytes) AS bytes,
            SUM(CASE WHEN gone_at IS NOT NULL THEN 1 ELSE 0 END) AS gone,
            MAX(at) AS last
     FROM backups GROUP BY store ORDER BY store`
  );
  const [last] = await coreQuery(`SELECT MAX(at) AS at FROM backup_log`);
  return { ready: true, lastRun: last?.at || null, stores: rows, never: NEVER };
}

/**
 * เรียกคืน — ค่าเริ่มต้นคือ "ซ้อมให้ดูก่อน" ไม่เขียนอะไรทั้งนั้น
 * ⚠️ ไม่ทับของที่ยังอยู่ นอกจากสั่ง overwrite มาชัด ๆ
 *    การกู้ข้อมูลที่ทับของใหม่ทิ้ง = สร้างความเสียหายรอบสองด้วยเครื่องมือกู้ภัย
 */
export async function restore({ store, key = "", confirm = false, overwrite = false } = {}) {
  if (!coreReady()) return { error: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const cfg = PROTECTED.find((p) => p.store === store);
  if (!cfg) return { error: `ถัง "${store}" ไม่ได้อยู่ในรายการที่สำรองไว้` };

  const where = key ? `AND key = ${esc(key)}` : "";
  const rows = await coreQuery(
    `SELECT key, body, bytes, at, gone_at FROM backups WHERE store = ${esc(store)} ${where}`
  );
  if (!rows.length) return { error: "ไม่มีสำเนาของถังนี้" };

  const s = getStore(store);
  const { blobs } = await s.list();
  const live = new Set((blobs || []).map((b) => b.key));

  const missing = rows.filter((r) => !live.has(r.key));
  const exists = rows.filter((r) => live.has(r.key));
  const plan = overwrite ? rows : missing;

  if (!confirm) {
    return {
      dryRun: true,
      store,
      willWrite: plan.length,
      missing: missing.length,
      alreadyThere: exists.length,
      sample: plan.slice(0, 10).map((r) => ({ key: r.key, bytes: num(r.bytes), backedUpAt: r.at })),
      note:
        "นี่คือการซ้อม ยังไม่ได้เขียนอะไรลงไป — สั่งจริงต้องส่ง confirm=1 " +
        "· ค่าเริ่มต้นเขียนเฉพาะคีย์ที่หายไปเท่านั้น ไม่ทับของที่ยังอยู่",
    };
  }

  let written = 0;
  const failed = [];
  for (const r of plan) {
    try {
      await s.set(r.key, r.body);
      written++;
    } catch (e) {
      failed.push({ key: r.key, why: String(e?.message || e).slice(0, 120) });
    }
  }
  return { store, written, skippedExisting: overwrite ? 0 : exists.length, failed };
}
