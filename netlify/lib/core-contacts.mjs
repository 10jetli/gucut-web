// กระจก "ลูกค้า/ผู้ติดต่อ" จาก ZORT เข้าคลังเงา — เจ้าของร้านสั่งดึงเอง 3 ก.ย. 2569
//
// 🔒 **นี่คือข้อมูลส่วนบุคคลของลูกค้าจริง 28,250 ราย — ต่างจากตารางอื่นทุกตาราง**
//    ชื่อ · เบอร์ · อีเมล · ที่อยู่ · เลขประจำตัว ⇒ กติกาที่ห้ามผ่อน:
//    1. **เก็บใน D1 เท่านั้น** (ปิดสนิท ต้องมีรหัสหลังร้าน) ห้ามลง R2 หรือถังสาธารณะใด ๆ
//       — กติกาเดียวกับใบ ลซ.๒ ที่เคยตัดสินไว้แล้ว
//    2. **ห้าม log · ห้ามส่งเข้า Telegram · ห้ามใส่ใน URL** แม้แต่เบอร์เดียว
//    3. **ห้ามมีทางดึงออกทั้งก้อน** — จอค้นหาได้ทีละหน้า มีเพดานต่อครั้ง
//       ไม่มี endpoint "เอาทั้งหมด" เพราะช่องแบบนั้นรั่วทีเดียวหมดทั้งฐาน
//    4. อย่าเอาไปปนกับสมาชิกเว็บ (Netlify Blobs) — คนละชุด คนละที่มา คนละความยินยอม
//
// ⚠️ เก็บเท่าที่ใช้จริงบนจอ **ไม่ยกมาทั้ง 25 ฟิลด์** — ฟิลด์ที่ไม่ได้ใช้แต่เก็บไว้
//    คือความเสี่ยงเปล่า ๆ (facebook · line · instagram · gender · birthDate · รูป
//    ว่างแทบทั้งหมดอยู่แล้ว และไม่มีจอไหนต้องใช้)
import { coreQuery, coreReady } from "./coredb.mjs";

const esc = (v) => `'${String(v ?? "").replace(/'/g, "''")}'`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const BASE = "https://open-api.zortout.com/v4";

function headers() {
  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME) return null;
  return { storename: ZORT_STORENAME, apikey: ZORT_APIKEY, apisecret: ZORT_APISECRET };
}

async function ensure() {
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS contacts (
       id TEXT PRIMARY KEY, type TEXT, name TEXT, code TEXT, tax_id TEXT,
       phone TEXT, email TEXT, address TEXT, branch_name TEXT, branch_no TEXT,
       updated_at TEXT)`
  );
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone)`);
  await coreQuery(`CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name)`);
}

/** ดึงผู้ติดต่อเข้าคลังเงา — **แบ่งรอบเหมือนรายการโอน** 28,250 ราย ไม่จบในคำขอเดียว
 *  คืน nextPage เมื่อยังไม่หมด · ไม่มี nextPage = ครบแล้ว */
export async function syncContacts(opt = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const h = headers();
  if (!h) return { skip: "ยังไม่ได้ตั้งรหัส ZORT" };
  await ensure();

  const startPage = Math.max(1, num(opt.startPage) || 1);
  const maxPages = Math.max(1, Math.min(20, num(opt.maxPages) || 6));
  const rows = [];
  let nextPage = null;
  let total = null;
  for (let page = startPage; page < startPage + maxPages; page++) {
    const res = await fetch(`${BASE}/Contact/GetContacts?limit=200&page=${page}`, {
      headers: h,
      signal: AbortSignal.timeout(12000),
    }).catch(() => null);
    /* 🔴 **แยก "ถามไม่สำเร็จ" ออกจาก "หน้านี้ไม่มีของแล้ว"** (แก้ 6 ก.ย. 2569)
        เดิมล้มแล้วได้ `data = null` ⇒ `list = []` ⇒ `break` ⇒ ตอบ `nextPage: null`
        ซึ่งตามเอกสารหัวฟังก์ชันแปลว่า **"ครบแล้ว"**
        ⇒ ล้มที่หน้าแรกของรอบ = ตอบว่า "ซิงก์เสร็จ · ผู้ติดต่อทั้งหมด 0 ราย · ไม่มีอะไรเหลือ"
          ทั้งที่ ZORT มีอยู่สองหมื่นกว่าราย · เป็นบั๊กตัวเดียวกับที่ zort-stock.mjs
          เขียนคำเตือนไว้ยาวเหยียด แต่ไฟล์นี้ไม่ได้ทำตาม
        ⇒ ถามไม่สำเร็จ = **ออกพร้อมธง** ให้ผู้เรียกไล่ต่อจากหน้าเดิมได้ ห้ามบอกว่าครบ */
    const ok = !!res?.ok;
    const data = ok ? await res.json().catch(() => null) : null;
    if (!ok || !data) {
      return {
        fetched: rows.length,
        written: 0,
        total,
        startPage,
        /* ชี้กลับที่หน้าที่ล้ม ไม่ใช่หน้าถัดไป — หน้านั้นยังไม่ได้ของ */
        nextPage: page,
        failedAtPage: page,
        error: `ถาม ZORT หน้า ${page} ไม่สำเร็จ (${res ? `HTTP ${res.status}` : "ต่อไม่ติด"}) — ยังไม่ครบ`,
        /* ⚠️ ทิ้งแถวที่ได้มาก่อนหน้าในรอบนี้ **โดยตั้งใจ** (written: 0)
            เพราะ `nextPage` ชี้กลับที่หน้าที่ล้ม ⇒ รอบหน้าจะดึงซ้ำตั้งแต่หน้านั้น
            และการเขียนเป็น upsert ตาม id ⇒ ดึงซ้ำไม่ทำให้ข้อมูลเพี้ยน
            เสียแค่การถามซ้ำไม่กี่หน้า แลกกับโค้ดที่มีทางออกทางเดียว ซึ่งพลาดยากกว่า */
      };
    }
    if (total === null) total = num(data?.count);
    const list = Array.isArray(data?.list) ? data.list : [];
    if (!list.length) break;
    for (const c of list) {
      const id = String(c?.id ?? "").trim();
      if (!id) continue;
      rows.push({
        id,
        type: String(c?.type ?? "").slice(0, 30),
        name: String(c?.name ?? "").slice(0, 160),
        code: String(c?.code ?? "").slice(0, 60),
        tax: String(c?.idnumber ?? "").slice(0, 30),
        // เบอร์มือถือมาก่อน ถ้าไม่มีค่อยใช้เบอร์บ้าน — จอต้องการช่องเดียว
        phone: String(c?.mobilePhone || c?.phone || "").slice(0, 40),
        email: String(c?.email ?? "").slice(0, 120),
        address: String(c?.address ?? "").slice(0, 300),
        bname: String(c?.branchname ?? "").slice(0, 80),
        bno: String(c?.branchno ?? "").slice(0, 30),
      });
    }
    if (list.length < 200) break;
    nextPage = page + 1;
  }
  if (!rows.length) return { fetched: 0, written: 0, total, startPage, nextPage: null };

  // เขียนเฉพาะรายที่เปลี่ยนจริง — โควตาเขียนของ D1 มีจำกัด และของพวกนี้แทบไม่ขยับ
  const ids = rows.map((r) => esc(r.id)).join(",");
  const prev = new Map(
    (
      await coreQuery(
        `SELECT id, type, name, code, tax_id, phone, email, address, branch_name, branch_no
         FROM contacts WHERE id IN (${ids})`
      )
    ).map((r) => [String(r.id), r])
  );
  const changed = rows.filter((r) => {
    const p = prev.get(r.id);
    return (
      !p || String(p.name ?? "") !== r.name || String(p.phone ?? "") !== r.phone ||
      String(p.email ?? "") !== r.email || String(p.address ?? "") !== r.address ||
      String(p.tax_id ?? "") !== r.tax || String(p.code ?? "") !== r.code ||
      String(p.type ?? "") !== r.type || String(p.branch_name ?? "") !== r.bname ||
      String(p.branch_no ?? "") !== r.bno
    );
  });

  for (let i = 0; i < changed.length; i += 60) {
    const values = changed
      .slice(i, i + 60)
      .map(
        (r) =>
          `(${esc(r.id)},${esc(r.type)},${esc(r.name)},${esc(r.code)},${esc(r.tax)},` +
          `${esc(r.phone)},${esc(r.email)},${esc(r.address)},${esc(r.bname)},${esc(r.bno)},datetime('now'))`
      )
      .join(",");
    await coreQuery(
      `INSERT INTO contacts (id,type,name,code,tax_id,phone,email,address,branch_name,branch_no,updated_at)
       VALUES ${values}
       ON CONFLICT(id) DO UPDATE SET type=excluded.type, name=excluded.name, code=excluded.code,
         tax_id=excluded.tax_id, phone=excluded.phone, email=excluded.email,
         address=excluded.address, branch_name=excluded.branch_name,
         branch_no=excluded.branch_no, updated_at=excluded.updated_at`
    );
  }
  return {
    fetched: rows.length,
    written: changed.length,
    skipped: rows.length - changed.length,
    total,
    startPage,
    nextPage,
  };
}

/** จอ "ลูกค้า/ผู้ติดต่อ" แบบ ZORT
 *  ⚠️ **ไม่มีโหมดเอาทั้งหมด** — เพดาน 100 แถวต่อครั้งโดยตั้งใจ
 *     ช่องที่ดึงได้ทีละหมื่นคือช่องที่รั่วทีเดียวหมดทั้งฐาน
 *  ⚠️ **เลขประจำตัวส่งไปแบบปิดบางส่วนเสมอ** เห็นเต็มไม่ได้จากจอรายการ
 *     จอรายการมีไว้ "หาให้เจอ" ไม่ใช่ "อ่านข้อมูลทุกคน" */
export async function listContacts(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  await ensure();
  const limit = Math.max(1, Math.min(100, num(o.limit) || 50));
  const offset = Math.max(0, num(o.offset));
  const q = String(o.q ?? "").trim().slice(0, 60);
  /* ⚠️ **กันไล่ดึงทั้งฐานทีละหน้า** — เพดาน 100 แถวอย่างเดียวไม่พอ
      ใครยิง offset ไปเรื่อย ๆ 283 ครั้งก็ได้ครบ 28,250 ราย
      ⇒ เปิดให้เปิดดูหน้าแรก ๆ ได้เหมือนจอ ZORT แต่จะเดินลึกต้องมีคำค้น
      (ตัวเลข 500 = ~10 หน้าแรก พอสำหรับการเปิดดู ไม่พอสำหรับการกวาด) */
  const DEEP = 500;
  if (!q && offset > DEEP) {
    return {
      total: null,
      limit,
      offset,
      needQuery: true,
      rows: [],
      note:
        `เปิดดูได้ถึงแถวที่ ${DEEP} โดยไม่ต้องค้นหา · ลึกกว่านี้ต้องพิมพ์คำค้น ` +
        "— ตั้งใจกันการไล่ดึงข้อมูลลูกค้าทั้งฐานทีละหน้า",
    };
  }
  const filter = q
    ? `AND (name LIKE ${esc(`%${q}%`)} OR phone LIKE ${esc(`%${q}%`)} OR code LIKE ${esc(`%${q}%`)})`
    : "";
  const [sum] = await coreQuery(
    `SELECT COUNT(*) AS c,
            SUM(CASE WHEN COALESCE(phone,'') <> '' THEN 1 ELSE 0 END) AS with_phone,
            SUM(CASE WHEN COALESCE(email,'') <> '' THEN 1 ELSE 0 END) AS with_email,
            SUM(CASE WHEN COALESCE(tax_id,'') <> '' THEN 1 ELSE 0 END) AS with_tax
     FROM contacts WHERE 1=1 ${filter}`
  );
  const rows = await coreQuery(
    `SELECT id, type, name, code, phone, email, branch_name AS branchName, tax_id AS taxId, address
     FROM contacts WHERE 1=1 ${filter} ORDER BY name LIMIT ${limit} OFFSET ${offset}`
  );
  const mask = (v) => {
    const s = String(v ?? "");
    return s.length > 4 ? `${"•".repeat(Math.max(0, s.length - 4))}${s.slice(-4)}` : s;
  };
  return {
    total: num(sum?.c),
    withPhone: num(sum?.with_phone),
    withEmail: num(sum?.with_email),
    withTax: num(sum?.with_tax),
    limit,
    offset,
    // ⚠️ ข้อความนี้ต้องขึ้นบนจอ — คนใช้ต้องรู้ว่ากำลังดูข้อมูลส่วนบุคคลอยู่
    note:
      "ข้อมูลส่วนบุคคลของลูกค้า — เปิดดูได้เฉพาะผู้มีรหัสหลังร้าน · " +
      "เลขประจำตัวและที่อยู่ปิดบางส่วนไว้ในจอรายการ",
    rows: rows.map((r) => ({
      ...r,
      taxId: mask(r.taxId),
      address: r.address ? `${String(r.address).slice(0, 24)}…` : "",
    })),
  };
}
