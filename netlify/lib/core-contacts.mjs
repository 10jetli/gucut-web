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
import { containsLit } from "./sql-contains.mjs";

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
  /* ⏱ deadlineAt (ใช้จากงานตามเวลา · 15 ก.ย. 2569) — เลิกเริ่มหน้าใหม่เมื่อเลยเวลา แล้วชี้ nextPage ที่หน้านั้น
      ⚠️ หยุดก่อนได้สักหน้า ห้ามตอบ nextPage: null (= ครบแล้ว) ⇒ ใช้ stoppedAt แยก */
  let stoppedAt = null;
  const nowFn = typeof opt.now === "function" ? opt.now : Date.now;
  for (let page = startPage; page < startPage + maxPages; page++) {
    if (opt.deadlineAt && nowFn() > opt.deadlineAt) { stoppedAt = page; nextPage = page; break; }
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
    /* 🔴 **หน้าว่าง/หน้าสุดท้าย = ครบแล้ว ⇒ nextPage ต้องเป็น null** (แก้ 15 ก.ย. 2569)
        เดิม break โดยไม่ล้าง nextPage ⇒ ค้างค่าจากหน้าก่อน (= เลขหน้านี้) ⇒ ผู้เรียกเข้าใจว่ายังไม่ครบ
        ต้องเรียกซ้ำอีกรอบถึงจะได้ null · งานกวาดตามเวลาจะไม่มีวันรู้ว่ากวาดครบในรอบที่ครบจริง */
    if (!list.length) { nextPage = null; break; }
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
    if (list.length < 200) { nextPage = null; break; }
    nextPage = page + 1;
  }
  if (!rows.length) return { fetched: 0, written: 0, total, startPage, nextPage: stoppedAt, stoppedByDeadline: stoppedAt !== null };

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
    stoppedByDeadline: stoppedAt !== null,
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
  /* ➕ ตัวกรองมีเบอร์/มีอีเมล (15 ก.ย. 2569 · gucut2 เจอลิงก์ "ค้นหาขั้นสูง" เป็นของประดับ เพราะท่อรับแต่ q)
      ⚠️ **ตัวกรองไม่นับเป็นคำค้น** — ด่าน DEEP ข้างบนยังบังคับเหมือนเดิม ไม่งั้นกลายเป็นช่องกวาดทั้งฐาน
      ⚠️ ไม่ทำตัวกรอง type — 15 ก.ย. นับ 500 แถวแรกเป็น "Undefined" ทุกแถว ⇒ ส่ง byType ของทั้งฐานให้ดูก่อน */
  const withPhone = o.withPhone === "1" || o.withPhone === true;
  const withEmail = o.withEmail === "1" || o.withEmail === true;
  const filter =
    (q ? `AND (${containsLit("name", esc(q))} OR ${containsLit("phone", esc(q))} OR ${containsLit("code", esc(q))})` : "") +
    (withPhone ? ` AND COALESCE(phone,'') <> ''` : "") +
    (withEmail ? ` AND COALESCE(email,'') <> ''` : "");
  const [sum] = await coreQuery(
    `SELECT COUNT(*) AS c,
            SUM(CASE WHEN COALESCE(phone,'') <> '' THEN 1 ELSE 0 END) AS with_phone,
            SUM(CASE WHEN COALESCE(email,'') <> '' THEN 1 ELSE 0 END) AS with_email,
            SUM(CASE WHEN COALESCE(tax_id,'') <> '' THEN 1 ELSE 0 END) AS with_tax
     FROM contacts WHERE 1=1 ${filter}`
  );
  const rows = await coreQuery(
    `SELECT id, type, name, code, phone, email, branch_name AS branchName, tax_id AS taxId, address
     FROM contacts WHERE 1=1 ${filter} ORDER BY name, id LIMIT ${limit} OFFSET ${offset}`
  );
  // นับชนิดของทั้งฐาน (ไม่ผูกตัวกรอง) — ใช้ตัดสินว่าตัวกรองชนิดมีประโยชน์ไหม · เป็นตัวเลขนับ ไม่มีข้อมูลรายคน
  const byType = await coreQuery(`SELECT COALESCE(type,'') AS type, COUNT(*) AS c FROM contacts GROUP BY 1 ORDER BY c DESC`).catch(() => null);
  /* ชีพจรซิงก์ (15 ก.ย. 2569) — จอต้องรู้ว่ากระจกสดแค่ไหน · อ่านไม่ได้ = null (ไม่รู้) ห้ามแปลว่าสด
      ที่มา: ท่อ 28,250 vs จอ ZORT 28,333 เพราะไม่มีอะไรสั่งซิงก์ (gucut2 จับได้) [[nothing-triggers-it]] */
  const metaRows = await coreQuery(
    `SELECT k, v, at FROM core_meta WHERE k IN ('sync_contacts_recent','sync_contacts_full','contacts_cursor')`
  ).catch(() => null);
  const meta = Array.isArray(metaRows) ? Object.fromEntries(metaRows.map((r) => [r.k, r])) : null;
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
    applied: { q: q || null, withPhone, withEmail },
    byType: byType ? byType.map((r) => ({ type: r.type, count: num(r.c) })) : null,
    // recentAtUtc = ซิงก์หน้าแรก ๆ ล่าสุด (รายใหม่) · fullSweepAtUtc = กวาดครบทั้งฐานรอบล่าสุด (การแก้ของรายเก่า) · null = ยังไม่เคย/ไม่รู้
    sync: meta
      ? { recentAtUtc: meta.sync_contacts_recent?.at ?? null, fullSweepAtUtc: meta.sync_contacts_full?.at ?? null,
          cursor: meta.contacts_cursor ? num(meta.contacts_cursor.v) : null }
      : null,
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

/** ภาพรวมลูกค้ารายคน — ตาม /Contact/ContactDetail ของ ZORT (ดูภาพรวม · ซื้อ · ขาย)
 *  เกิดจากงานเทียบ "กดได้เหมือน ZORT" 8 ก.ย. 2569 — จอผู้ติดต่อต้องกดชื่อเข้ารายคนได้
 *
 *  รับ `id` = รหัสผู้ติดต่อ (id/code) หรือชื่อเต็ม — จอส่งอะไรมาก็หาให้เจอ
 *  ⚠️ **ออเดอร์ผูกกับผู้ติดต่อด้วย "ชื่อ" เท่านั้น** (orders.customer เป็นสตริงชื่อ
 *     กระจกจาก ZORT ไม่มีคอลัมน์รหัสลูกค้า) ⇒ คนละคนชื่อซ้ำกันจะปนกัน — ข้อจำกัดที่
 *     ต้องเขียนบอกบนจอ ไม่ใช่ซ่อน · ชื่อที่มาร์เก็ตเพลส mask (อ******ว) จับคู่ไม่ได้
 *     โดยธรรมชาติ — จอควรบอกว่า "ชื่อถูกปิดบังจากแพลตฟอร์ม" ไม่ใช่ "ไม่มีประวัติ" */
// เงื่อนไข 'ไม่นับใบยกเลิก' — สำเนาจาก core-orders (ไฟล์นั้นไม่ได้ export)
// ⚠️ สามไฟล์มีสำเนาเดียวกันแล้ว (orders/stock/contacts) — แก้เงื่อนไขยกเลิกต้องแก้สามที่
const CANCEL_SQL =
  `status NOT LIKE '%cancel%' AND status NOT LIKE '%void%' AND status NOT LIKE '%ยกเลิก%'`;

export async function getCustomerDetail(idOrName) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const key = String(idOrName ?? "").trim().slice(0, 120);
  if (!key) return { error: "ต้องระบุรหัสหรือชื่อผู้ติดต่อ" };

  /* 🔴 **ชื่อผู้ติดต่อไม่ได้ไม่ซ้ำกัน** (แก้ 19 ก.ย. เย็น · คลาส "ของที่มีมากกว่าหนึ่ง")
      ของเดิม `LIMIT 1` แล้วหยิบ `[0]` ⇒ ถ้ามีสองรายชื่อเดียวกัน **เลือกใครก็ไม่รู้แบบเงียบ ๆ**
      ⇒ จอจะโชว์ประวัติของรายหนึ่งเป็นของอีกราย โดยดูสมเหตุสมผลทุกประการ
      ⇒ ดึงมา 2 แถวเพื่อ **รู้ว่าซ้ำ** (ไม่ใช่เพื่อใช้) แล้วยังคืนรายแรกเหมือนเดิม
        + ติดธง `ชื่อซ้ำกันหลายราย` ให้จอเตือนได้ ⇒ **เพิ่มอย่างเดียว ไม่เปลี่ยนพฤติกรรมเดิม** */
  const ผู้ติดต่อที่ตรง = await coreQuery(
    `SELECT * FROM contacts WHERE id = ${esc(key)} OR code = ${esc(key)} OR name = ${esc(key)} LIMIT 2`
  );
  const contact = ผู้ติดต่อที่ตรง[0] || null;
  const ชื่อซ้ำกันหลายราย = ผู้ติดต่อที่ตรง.length > 1;

  // ชื่อที่ใช้ตามหาออเดอร์ — จากทะเบียนถ้าเจอ ไม่งั้นใช้ค่าที่ส่งมาตรง ๆ
  const name = contact?.name || key;
  const [sums, recent, money, products, productSum, buys, buySum, cats] = await Promise.all([
    coreQuery(
      `SELECT COUNT(*) n, COALESCE(SUM(amount),0) total,
              MIN(order_date) first_day, MAX(order_date) last_day
         FROM orders WHERE customer = ${esc(name)} AND ${CANCEL_SQL}`
    ),
    coreQuery(
      `SELECT id, source, number, channel, status, amount, order_date, tracking_no, pay_status
         FROM orders WHERE customer = ${esc(name)}
        ORDER BY order_date DESC, number DESC LIMIT 20`
    ),
    /* 💰 การ์ดเงินสองใบแรกของจอ `/Contact/ContactDetail` (ยอดขายเดือนนี้ · ยอดขายปีนี้)
       🔬 **กติกาไม่ได้เดา — วัดจากจอ ZORT จริง 18 ก.ย. 2569 สามราย** (อ่านอย่างเดียว ผ่าน CDP 9223)
         · รายที่ 1: ใบ "รอโอน/รอชำระ" 5 ใบ 10,980 + ใบ "สำเร็จ/ชำระครบ" 6,570 ⇒ ZORT ขึ้นปีนี้ **6,570**
         · รายที่ 2: ใบเดียว **"รอโอน" แต่ "ชำระครบ"** 18,000 ⇒ ZORT ขึ้นทั้งเดือนนี้และปีนี้ **18,000**
         ⇒ คู่นี้แยกได้ชัดว่า ZORT นับที่ **การชำระเงิน ไม่ใช่สถานะเอกสาร**
           (ถ้านับที่สถานะ "สำเร็จ" รายที่ 2 ต้องเป็น "-" แต่ของจริงขึ้น 18,000)
         · รายที่ 3 ใช้ **ทำนายก่อนเปิดดู**: กระจกเราบอกไม่มีใบชำระครบเลย ⇒ ทำนาย "-" ทั้งสองใบ · เปิดจริงได้ "-" ทั้งคู่ ✅
       ⚠️ เดือน/ปี = **ปฏิทินไทย (UTC+7)** ⇒ ตัดเส้นใน SQL ด้วย 'now','+7 hours' ที่เดียว
          ห้ามให้จอคิดเอง (จอกับท่ออยู่คนละเขตเวลาได้ ⇒ วันที่ 1 ของเดือนจะเพี้ยนเงียบ ๆ)
       ⚠️ ยังตัดใบยกเลิกด้วย CANCEL_SQL เหมือนช่องอื่นของก้อนนี้ — ให้ทุกเลขบนจอเดียวกันมากติกาเดียว */
    coreQuery(
      `SELECT COALESCE(SUM(amount),0) all_paid,
              COALESCE(SUM(CASE WHEN substr(order_date,1,7) = strftime('%Y-%m','now','+7 hours')
                                THEN amount ELSE 0 END),0) month_paid,
              COALESCE(SUM(CASE WHEN substr(order_date,1,4) = strftime('%Y','now','+7 hours')
                                THEN amount ELSE 0 END),0) year_paid,
              strftime('%Y-%m','now','+7 hours') ym, strftime('%Y','now','+7 hours') y
         FROM orders
        WHERE customer = ${esc(name)} AND pay_status = 'Paid' AND ${CANCEL_SQL}`
    ),
    /* 🧺 กล่อง "ยอดขาย · รายสินค้า" ของจอ ZORT — ใบที่ชำระครบเท่านั้น (กติกาเดียวกับการ์ดเงิน)
       🔬 ยืนยันว่าเป็นชุดเดียวกันจริง: รายที่วัดเมื่อ 18 ก.ย. 2569 ผลรวมรายสินค้าบนจอ ZORT
          (4,580.96 + 1,026.77 + 494.70 + 420.18 + 47.39) = 6,570.00 = การ์ด "ยอดขายปีนี้" พอดี
       ⚠️ เพดาน 20 แถว ⇒ ต้องส่ง "ทั้งหมดกี่รายการ/กี่บาท" มาด้วย ไม่งั้นจอเอาเลขที่ถูกตัด
          ไปวางคู่ยอดรวมโดยไม่มีใครรู้ (กฎ: ตัวนับกับตัวแถวต้องมาที่เดียวกัน หรือเขียนบอกว่าต่างกัน) */
    coreQuery(
      `SELECT i.sku, i.name, COALESCE(SUM(i.qty),0) qty, COALESCE(SUM(i.amount),0) amount
         FROM order_items i JOIN orders o ON o.id = i.order_id
        WHERE o.customer = ${esc(name)} AND o.pay_status = 'Paid' AND ${CANCEL_SQL}
        GROUP BY i.sku, i.name ORDER BY amount DESC LIMIT 20`
    ),
    coreQuery(
      `SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM (
         SELECT i.sku, SUM(i.amount) amount
           FROM order_items i JOIN orders o ON o.id = i.order_id
          WHERE o.customer = ${esc(name)} AND o.pay_status = 'Paid' AND ${CANCEL_SQL}
          GROUP BY i.sku, i.name)`
    ),
    /* 🗂 แท็บ "รายหมวดหมู่" ของกล่องเดียวกันบนจอ ZORT
       ⚠️ **SKU ที่ไม่อยู่ในคลังสินค้า ต้องเป็นกองแยก "ยังไม่รู้หมวด" ห้ามยัดรวมหมวดใดหมวดหนึ่ง**
          (LEFT JOIN ⇒ category เป็น null ได้ · null ที่ถูกแปลงเป็นชื่อหมวดคือการโกหกเงียบ ๆ)
       ⚠️ ยอดที่ใช้เป็นราคาก่อนเกลี่ยส่วนลดท้ายบิลเหมือนแท็บรายสินค้า ⇒ ใช้คำอธิบายส่วนต่างชุดเดียวกัน */
    /* 🧾 คอลัมน์ "ประเภท" ของตารางบนจอ ZORT — ตารางเดียวมีทั้ง **ขายออก** และ **ซื้อเข้า**
       (เห็นจริงบนจอ ZORT 18 ก.ย. 2569: ผู้ติดต่อรายหนึ่งมีแถว "ซื้อเข้า PO-…" ปนกับใบขาย)
       ผู้ติดต่อคนเดียวเป็นได้ทั้งลูกค้าและคู่ค้า ⇒ จับจาก vendor ของใบซื้อด้วยชื่อตรงตัวแบบเดียวกับใบขาย
       ⚠️ ตารางใบซื้อของกระจกไม่มีคอลัมน์ลูกค้า มีแต่ vendor ⇒ ข้อจำกัดการจับคู่ชุดเดียวกัน (ชื่อซ้ำกันปนกันได้)
       ⚠️ **ตัดคนละ 20 ใบกับใบขาย** ⇒ จอต้องเขียนว่าเป็น "20 ล่าสุดของแต่ละชนิด"
          ห้ามเอามาเรียงรวมแล้วบอกว่านี่คือ 20 ล่าสุดของทั้งหมด (ใบเก่าของชนิดหนึ่งจะเบียดใบใหม่ของอีกชนิดหาย) */
    coreQuery(
      `SELECT id, source, number, po_date, status, amount, payment_status
         FROM purchase_orders_v2 WHERE vendor = ${esc(name)}
        ORDER BY po_date DESC, number DESC LIMIT 20`
    ).catch(() => null),
    coreQuery(
      `SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM purchase_orders_v2 WHERE vendor = ${esc(name)}`
    ).catch(() => null),
    coreQuery(
      `SELECT p.category AS cat, COALESCE(SUM(i.amount),0) amount, COUNT(DISTINCT i.sku) skus
         FROM order_items i JOIN orders o ON o.id = i.order_id
         LEFT JOIN products p ON p.sku = i.sku
        WHERE o.customer = ${esc(name)} AND o.pay_status = 'Paid' AND ${CANCEL_SQL}
        GROUP BY p.category ORDER BY amount DESC LIMIT 20`
    ),
  ]);
  const s = sums[0] || {};
  const m = money[0] || {};
  return {
    contact,                                   // null = ไม่อยู่ในทะเบียน (แต่มีออเดอร์ได้)
    /* ⚠️ **true = มีผู้ติดต่อมากกว่าหนึ่งรายที่ตรงกับคำค้นนี้** (ชื่อซ้ำกันได้ · เพิ่ม 19 ก.ย. เย็น)
       ⇒ ค่าที่คืนไปเป็นของ **รายแรกที่ฐานให้มา** ⇒ จอต้องเขียนเตือนว่าอาจไม่ใช่รายที่ผู้ใช้หมายถึง
       🚫 ห้ามซ่อน — ยอดขาย/ประวัติของคนละรายจะถูกอ่านเป็นของรายเดียวกันโดยดูสมเหตุสมผลทุกประการ */
    "ชื่อซ้ำกันหลายราย": ชื่อซ้ำกันหลายราย,
    name,
    orders: { count: Number(s.n) || 0, total: Number(s.total) || 0,
              firstDay: s.first_day || null, lastDay: s.last_day || null, recent },
    /* การ์ดเงินแบบเดียวกับ ZORT — คิดจาก SQL ทั้งกอง **ไม่ใช่จาก recent ที่ถูกตัดเหลือ 20 แถว**
       (คิดจาก recent จะได้เลขที่ดูสมเหตุสมผลแต่ผิดสำหรับลูกค้าที่ซื้อเกิน 20 ใบ) */
    money: {
      thisMonth: Number(m.month_paid) || 0,
      thisYear: Number(m.year_paid) || 0,
      month: m.ym || null,                     // เดือน/ปีที่ใช้ตัดจริง — จอเอาไปเขียนกำกับได้ ห้ามเดาเอง
      year: m.y || null,
      /* ⚠️ **ขอบเขต "ร้าน" ต้องเขียนกำกับ ไม่งั้นเลขเราสูงกว่า ZORT แล้วไม่มีใครรู้ว่าทำไม**
         จอ ZORT เป็นของบัญชีที่ล็อกอินอยู่บัญชีเดียว แต่กระจกเรารวมสองร้าน (z1 + z2/ceojet)
         วัดจริง 18 ก.ย. 2569: ลูกค้า 28 จาก 100 อันดับแรกซื้อข้ามร้าน (Shopee-gucut + ZAMA Shopee)
         ⇒ คนกลุ่มนี้เลขของเราจะ **มากกว่าจอ ZORT อย่างถูกต้อง** — ต้องบอก ไม่ใช่ปล่อยให้เดา */
      scope: "นับเฉพาะใบที่การชำระเงิน = ชำระครบ (ตรงกับกติกาการ์ดของ ZORT · วัดจริง 18 ก.ย. 2569) · " +
             "ไม่รวมใบยกเลิก · เดือน/ปีตัดตามปฏิทินไทย · " +
             "รวมทุกร้านในกระจก (z1 + z2) ต่างจากจอ ZORT ที่เห็นเฉพาะบัญชีที่ล็อกอินอยู่ ⇒ ลูกค้าที่ซื้อข้ามร้านเลขที่นี่จะมากกว่า",
      /* 🔴 **ใบที่สามของ ZORT (ยอดค้างชำระ) จงใจส่ง null — ไม่ใช่ 0**
         วัดจริงสองราย: รายหนึ่งมีใบ "รอชำระ" 10,980 อีกรายมี 55,200 แต่ **ZORT ขึ้น "-" ทั้งคู่**
         ⇒ พิสูจน์ว่า "ยอดค้างชำระ" ของ ZORT **ไม่ใช่ผลรวมใบขายที่ยังไม่ชำระ** (ถ้าใช่ต้องขึ้นเลขนั้น)
           ยังไม่รู้ว่ามันมาจากไหน (น่าจะเป็นฝั่งลูกหนี้ของโมดูลการเงิน ซึ่งเราไม่มีกระจก)
         ⇒ ห้ามคำนวณจากใบขายมาใส่ให้ครบใบ — จะได้เลขที่ **ดูสมเหตุสมผลแต่ตอบคนละคำถามกับ ZORT** */
      outstanding: null,
      outstandingWhy:
        "ยังคิดไม่ได้ — วัดแล้วพบว่า ZORT ไม่ได้เอาผลรวมใบขายที่ยังไม่ชำระมาใส่ช่องนี้ " +
        "(ลูกค้าที่มีใบรอชำระ 10,980 และ 55,200 จอ ZORT ยังขึ้น '-') ⇒ ต้องรู้ที่มาของตัวเลขก่อนจึงทำได้ · " +
        "เมนูการเงินของ ZORT ในบัญชีนี้ก็ไม่มีหน้าลูกหนี้ (มีแค่ ภาพรวม · กระเป๋าเงิน · รายได้อื่น · รายจ่ายอื่น · โอนเงิน · รับเงิน COD) ตรวจ 18 ก.ย. 2569",
    },
    /* 🧺 "ยอดขาย · รายสินค้า" แบบจอ ZORT — ชุดเดียวกับการ์ดเงิน (เฉพาะใบที่ชำระครบ)
       ⚠️ rows ถูกตัดที่ 20 ⇒ ส่ง count/amount ของทั้งชุดมาคู่กันเสมอ ให้จอเขียนได้ว่า "มี N แสดง M" */
    products: {
      rows: (products || []).map((r) => ({
        sku: r.sku || null, name: r.name || null, qty: Number(r.qty) || 0, amount: Number(r.amount) || 0,
      })),
      count: Number(productSum?.[0]?.n) || 0,
      amount: Number(productSum?.[0]?.s) || 0,
      /* 🔴 **ยอดรวมรายสินค้า ≠ ยอดรวมหัวใบ ได้จริง — ต้องส่งทั้งสองตัวไปให้จอเทียบ**
         วัดจริง 18 ก.ย. 2569 (ลูกค้าที่เทียบกับ ZORT): ผลรวมบรรทัด 7,570 · หัวใบ 6,570
         และเลขรายสินค้าบนจอ ZORT **ต่ำกว่าของเราทุกบรรทัดด้วยอัตราเดียวกันเป๊ะ (×0.8679)**
         ⇒ ZORT เกลี่ยส่วนลดท้ายบิลลงในแต่ละบรรทัดแล้ว ส่วนกระจกเราเก็บราคาก่อนเกลี่ย
         ⚠️ ใบนั้น `bill_discount` ในกระจกเป็น **null = ไม่รู้** (ไม่ใช่ 0) ⇒ เกลี่ยเองไม่ได้
            ถ้าดันเกลี่ยด้วยการปรับให้เท่าหัวใบ จะพลาดทันทีเมื่อใบมีค่าส่ง (หัวใบรวมค่าส่งอยู่)
         ⇒ ส่งเลขที่เรารู้จริงทั้งสองตัว แล้วให้จอเขียนบอกส่วนต่าง **ห้ามวางเลขเดียวเงียบ ๆ**
            เพราะคนเปิดเทียบกับ ZORT จะเห็นของเราสูงกว่าแล้วไม่รู้ว่าใครผิด */
      ordersAmount: Number(money?.[0]?.all_paid) || 0,
      scope: "เฉพาะใบที่การชำระเงิน = ชำระครบ ไม่รวมใบยกเลิก (ชุดเดียวกับการ์ดเงิน) · ทุกช่วงเวลา · เรียงตามมูลค่า เอา 20 อันดับแรก · รวมทุกร้านในกระจก",
      /* แท็บ "รายหมวดหมู่" — หมวดมาจากตาราง products (คนละตารางกับบรรทัดใบ)
         category = null ⇒ SKU นั้นไม่อยู่ในคลังสินค้าของเรา = **ยังไม่รู้หมวด** ห้ามนับเป็นหมวดใดหมวดหนึ่ง */
      byCategory: (cats || []).map((r) => ({
        category: r.cat || null,
        amount: Number(r.amount) || 0,
        skus: Number(r.skus) || 0,
      })),
      diffNote:
        "ยอดรายสินค้าเป็นราคาต่อบรรทัด **ก่อน** เกลี่ยส่วนลดท้ายบิล ส่วนยอดรวมใบเป็นหลังหักแล้ว ⇒ สองเลขนี้ต่างกันได้ " +
        "จอ ZORT เกลี่ยส่วนลดลงบรรทัดแล้ว เลขรายสินค้าของ ZORT จึงต่ำกว่าของที่นี่ · " +
        "กระจกยังไม่มีค่าส่วนลดท้ายบิลของใบเก่า (null = ไม่รู้ ไม่ใช่ 0) จึงยังเกลี่ยตามไม่ได้",
    },
    /* 🧾 ใบซื้อของผู้ติดต่อรายนี้ — คอลัมน์ "ประเภท" ของ ZORT (ขายออก/ซื้อเข้าอยู่ตารางเดียวกัน)
       🔴 อ่านตารางใบซื้อไม่ได้ ⇒ ส่ง null ทั้งก้อน = **ยังไม่รู้** ห้ามกลายเป็น "ไม่มีใบซื้อ"
          (ตารางใบซื้อของบางร้านอาจยังไม่ถูกซิงก์ ⇒ เลข 0 ที่ไม่มีที่มาจะทำให้คนเชื่อว่าไม่เคยซื้อขายกัน) */
    purchases: buys === null || buySum === null ? null : {
      rows: (buys || []).map((r) => ({
        id: r.id || null, source: r.source || null, number: r.number || null,
        date: r.po_date || null, status: r.status || null,
        amount: Number(r.amount) || 0, payStatus: r.payment_status || null,
      })),
      count: Number(buySum?.[0]?.n) || 0,
      amount: Number(buySum?.[0]?.s) || 0,
      scope: "จับคู่ด้วยชื่อคู่ค้าตรงตัวแบบเดียวกับใบขาย · 20 ใบล่าสุด (ตัดคนละชุดกับใบขาย) · ทุกสถานะ",
    },
    matchNote: "จับคู่ออเดอร์ด้วยชื่อเต็มตรงตัว — ชื่อซ้ำกันจะปนกัน · ชื่อที่ถูก mask จับคู่ไม่ได้",
  };
}

/* ⏰ ซิงก์ผู้ติดต่อตามเวลา — งานกระดาน t_mu2045bl (15 ก.ย. 2569)
   ที่มา: gucut2 เจอท่อ 28,250 vs จอ ZORT 28,333 ⇒ พิสูจน์แล้ว **ไม่มีอะไรสั่งซิงก์** (มีแค่ ?synccontacts= สั่งมือ)
          ซิงก์หน้า 1 หน้าเดียวเขียนรายใหม่ 84 ⇒ ตรง ZORT 28,334 [[nothing-triggers-it]]
   สองจังหวะ แชร์งบเวลาเดียวกัน (เพดานฟังก์ชัน 26 วิ):
     ① หน้า 1–2 ทุกรอบ — รายใหม่เข้าหน้าแรก
     ② กวาดทั้งฐานต่อจาก contacts_cursor ครั้งละ ≤6 หน้า — ตามการแก้ของรายเก่า (28k ราย ≈ 142 หน้า ≈ วันละรอบ)
   🔒 อ่านตำแหน่งกวาดไม่ได้ ⇒ ข้ามจังหวะ ② (ไม่เดาเริ่มหน้า 1 — read-before-write-no-swallow)
   🔒 ไม่มีรหัส ZORT (skip) ⇒ ไม่แตะ cursor · หน้าล้ม ⇒ cursor ชี้หน้าที่ล้ม รอบหน้าลองซ้ำ
   ⚠️ ซิงก์นี้ **ไม่ลบ** รายที่ไม่เจอ — หน้าล้ม/ZORT ตอบไม่ครบ ≠ ลูกค้าหายไป */
const pickSync = (r) => ({ fetched: r?.fetched ?? 0, written: r?.written ?? 0, total: r?.total ?? null,
  nextPage: r?.nextPage ?? null, stoppedByDeadline: !!r?.stoppedByDeadline, error: r?.error ?? null });

async function writeMeta(k, v, errors) {
  try {
    await coreQuery(
      `INSERT INTO core_meta (k,v,at) VALUES (?, ?, datetime('now')) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at`,
      [k, v]
    );
  } catch {
    errors.push({ stage: "meta", key: k, error: "จดชีพจรไม่สำเร็จ" });
  }
}

export async function syncContactsScheduled(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const now = typeof o.now === "function" ? o.now : Date.now;
  const deadlineAt = now() + (Number(o.budgetMs) > 0 ? Number(o.budgetMs) : 15000);
  const out = { recent: null, sweep: null, errors: [] };

  const recent = await syncContacts({ startPage: 1, maxPages: 2, deadlineAt, now });
  out.recent = pickSync(recent);
  if (recent?.skip) return { ok: false, skip: recent.skip, ...out };
  if (recent?.error) out.errors.push({ stage: "recent", error: recent.error });
  else await writeMeta("sync_contacts_recent", "ok", out.errors);

  let cursor;
  try {
    const [row] = await coreQuery(`SELECT v FROM core_meta WHERE k = 'contacts_cursor'`);
    cursor = Math.max(1, num(row?.v) || 1);
  } catch {
    out.errors.push({ stage: "cursor", error: "อ่านตำแหน่งกวาดไม่ได้ — ข้ามรอบกวาดทั้งฐาน (ไม่เดาเริ่มหน้า 1)" });
    return { ok: false, ...out };
  }
  if (now() > deadlineAt) {
    out.sweep = { skipped: "หมดงบเวลาหลังรอบหน้าแรก", from: cursor };
    return { ok: out.errors.length === 0, ...out };
  }
  const sweep = await syncContacts({ startPage: cursor, maxPages: 6, deadlineAt, now });
  out.sweep = { ...pickSync(sweep), from: cursor };
  if (sweep?.skip) return { ok: false, skip: sweep.skip, ...out };
  if (sweep?.error) out.errors.push({ stage: "sweep", error: sweep.error });
  /* nextPage: null = กวาดครบรอบ ⇒ เริ่มหน้า 1 · มีค่า = หน้าถัดไป/หน้าที่ล้ม/หน้าที่ยังไม่เริ่มเพราะหมดเวลา */
  const complete = !sweep?.error && sweep?.nextPage === null;
  const next = complete ? 1 : Math.max(1, num(sweep?.nextPage) || cursor);
  await writeMeta("contacts_cursor", String(next), out.errors);
  if (complete) await writeMeta("sync_contacts_full", "complete", out.errors);
  out.sweep.nextCursor = next;
  out.sweep.sweepComplete = complete;
  return { ok: out.errors.length === 0, ...out };
}
