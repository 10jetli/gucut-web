// ย้ายฐาน D1 ไปโซนที่อยู่ใกล้ฟังก์ชัน — เครื่องมือคัดลอก + เทียบ (5 ก.ย. 2569)
//
// ⚠️⚠️ **ไฟล์นี้ไม่มีคำสั่งลบหรือแก้ฐานเดิมเลยแม้แต่บรรทัดเดียว โดยตั้งใจ**
//    ไม่ใช่ "มีแต่ปิดไว้" — คือ **ไม่มีอยู่จริง** ⇒ ต่อให้เรียกผิดลำดับ ตั้งค่าผิด หรือมีคนแก้พลาด
//    ฐานเดิมก็เสียหายไม่ได้ เพราะไม่มีโค้ดให้ทำ
//    **ห้ามเติมคำสั่ง DROP / DELETE / ALTER ที่ชี้ไปฐานต้นทางลงไฟล์นี้เด็ดขาด**
//
// ── ทำไมต้องย้าย ── (วัดจริง 5 ก.ย. 2569 ผ่าน ?dbinfo=1)
//    ฐาน `gucut-core` อยู่ **APAC** · ฟังก์ชัน Netlify อยู่ **อเมริกา**
//    `SELECT 1` ไป-กลับ = **286 ms** (ควรเป็น 20–40 ถ้าอยู่ใกล้กัน)
//    ⇒ ทุกจอในหลังร้านจ่ายค่าข้ามแปซิฟิกทุกคำขอ · ลดจำนวนรอบไปแล้ววันนี้ เหลือลดระยะทาง
//
// ⚠️ **ทำไมไม่ใช้ read replication ของ D1 แทน** — ตรวจเอกสารแล้ว (5 ก.ย. 2569)
//    replica ใช้ได้เฉพาะผ่าน **Workers binding + Sessions API** เท่านั้น
//    ฝั่งเราคุยกับ D1 ผ่าน **REST** ⇒ ทุกคำขอวิ่งเข้า primary เสมอ **เปิด replication ไปก็ไม่ได้อะไร**
//    (และปิดกลับใช้เวลาถึง 24 ชม.) ⇒ ทางที่ได้ผลจริงคือย้าย primary
//
// ── ลำดับที่ปลอดภัย (ห้ามข้ามขั้น) ──
//    ① ?d1move=plan    ดูว่าจะย้ายอะไรบ้าง กี่แถว · ฟังก์ชันอยู่โซนไหนจริง   (อ่านอย่างเดียว)
//    ② ?d1move=create  สร้างฐานใหม่ในโซนที่ถูก                              (ไม่แตะฐานเดิม)
//    ③ ?d1move=schema  ลอกโครงตาราง+ดัชนีทั้งหมดไปฐานใหม่                    (เขียนฐานใหม่)
//    ④ ?d1move=copy    ลอกข้อมูลทีละก้อน เรียกซ้ำจนครบ                       (เขียนฐานใหม่)
//    ⑤ ?d1move=verify  เทียบจำนวนแถว + ผลรวมตัวเลขทุกตาราง                   (อ่านอย่างเดียว)
//    ⑥ สับสวิตช์ = เปลี่ยน env `CORE_D1_ID` ที่ Netlify **ด้วยมือ ไม่ได้อยู่ในไฟล์นี้**
//       ⚠️ ห้ามสับจนกว่า ⑤ จะผ่านครบทุกตาราง · ถอยกลับ = เปลี่ยน env กลับค่าเดิม (ฐานเดิมยังอยู่ครบ)

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "f496328a3fb6eac88b6ff64eb4b52fd3";
/* ⚠️ **ต้นทางต้องปักหมุดไว้ ห้ามอ่านจาก `CORE_D1_ID`** (แก้ 5 ก.ย. 2569 หลังสับสวิตช์)
    หลังสับสวิตช์ env ชี้ไป**ฐานใหม่**แล้ว ⇒ ถ้ายังอ่านจาก env
    `verify` จะกลายเป็นเทียบฐานใหม่กับตัวเอง แล้ว**ผ่าน 19/19 ตลอดกาล**
    ซึ่งเป็นตัวตรวจที่ไม่ได้ตรวจอะไรเลย แต่ขึ้นเขียวสวยงาม (probe-shares-the-bug)
    และ `copy` จะกลายเป็นลอกฐานใหม่ทับตัวเอง */
const SRC = process.env.CORE_D1_OLD_ID || "a4007558-23ba-41df-8311-1c674ff12ae5";
const NEW_NAME = "gucut-core-us";

/* ── บันทึกการสับสวิตช์ 5 ก.ย. 2569 22:04 น. ──
   `CORE_D1_ID` ที่ Netlify เปลี่ยนเป็น `0b8ead77-…` (gucut-core-us · โซนอเมริกา) แล้ว
   วัดก่อนสับ 4 รอบ: ฐานเก่า 286/291/297/308 ms · ฐานใหม่ 61/63/65/66 ms ⇒ เร็วขึ้น ~4.6 เท่า
   ⚠️ **ฐานเก่า `a4007558-…` ยังอยู่ครบ ไม่ถูกแตะเลย** — ถอยกลับ = เปลี่ยน env กลับแล้ว deploy
   ⚠️ **คอมมิตเปล่าไม่ทำให้ Netlify build ใหม่** (พิสูจน์แล้วคืนนี้ รอ 12 นาทีไม่ขยับ)
      ⇒ ต้องมีไฟล์เปลี่ยนจริงถึงจะได้ deploy ที่หยิบ env ตัวใหม่ไปใช้ */

/* ⚠️ โซนของฐานใหม่ต้องตรงกับโซนที่ **ฟังก์ชัน** รันอยู่ ไม่ใช่โซนที่ร้านตั้งอยู่
    Netlify Functions รันบน AWS ฝั่งตะวันออกของอเมริกา (us-east-1/us-east-2)
    ⇒ enam = Eastern North America · ตัว ?d1move=plan รายงาน AWS_REGION จริงมาให้ตรวจซ้ำ
    ⚠️ ถ้า plan รายงานว่าไม่ใช่ us-east-* **ห้ามสร้างด้วยค่านี้** ให้เปลี่ยนก่อน */
const HINT = process.env.CORE_D1_NEW_HINT || "enam";

const api = async (path, init = {}) => {
  const token = process.env.CLOUDFLARE_D1_TOKEN;
  if (!token) throw new Error("ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN");
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(`CF ${res.status}: ${JSON.stringify(data?.errors || data).slice(0, 300)}`);
  }
  return data.result;
};

const q = (dbId, sql, params = []) =>
  api(`/d1/database/${dbId}/query`, { method: "POST", body: JSON.stringify({ sql, params }) }).then(
    (r) => r?.[0]?.results ?? []
  );

/** ตารางทั้งหมดของฐานต้นทาง (ไม่รวมของ SQLite เอง) */
async function tablesOf(dbId) {
  const rows = await q(
    dbId,
    `SELECT name, sql FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
      ORDER BY name`
  );
  return rows.map((r) => ({ name: String(r.name), sql: String(r.sql || "") }));
}

async function indexesOf(dbId) {
  const rows = await q(
    dbId,
    `SELECT name, sql FROM sqlite_master
      WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
      ORDER BY name`
  );
  return rows.map((r) => ({ name: String(r.name), sql: String(r.sql) }));
}

/** หาฐานปลายทางจากชื่อ — คืน null ถ้ายังไม่มี */
async function findTarget() {
  const list = await api(`/d1/database?per_page=100`);
  const hit = (list || []).find((d) => d.name === NEW_NAME);
  return hit ? { id: hit.uuid, name: hit.name, region: hit.running_in_region ?? null } : null;
}

/** ── ① สำรวจ ── อ่านอย่างเดียวทั้งหมด */
export async function movePlan() {
  const [src, tgt] = await Promise.all([api(`/d1/database/${SRC}`), findTarget().catch(() => null)]);
  const tabs = await tablesOf(SRC);
  const counts = await Promise.all(
    tabs.map(async (t) => ({
      table: t.name,
      rows: Number((await q(SRC, `SELECT COUNT(*) c FROM "${t.name}"`))[0]?.c ?? 0),
    }))
  );
  return {
    source: { id: SRC, name: src?.name, region: src?.running_in_region, sizeBytes: src?.file_size },
    target: tgt ?? { note: `ยังไม่ได้สร้าง — เรียก ?d1move=create` },
    plannedName: NEW_NAME,
    plannedHint: HINT,
    /* ⚠️ **ต้องยืนยันโซนของฟังก์ชันก่อนสร้างฐานใหม่** — เดาผิดแล้วย้ายไปโซนที่ยังไกลอยู่ดี
        แล้วจะไม่มีอะไรฟ้อง เพราะ "ย้ายแล้ว" ดูเหมือนสำเร็จเสมอ */
    functionRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || null,
    functionRegionNote:
      "ฐานใหม่ต้องอยู่โซนเดียวกับตัวนี้ · us-east-* ⇒ enam · us-west-* ⇒ wnam · ไม่ใช่ทั้งคู่ = อย่าเพิ่งสร้าง",
    tables: counts.sort((a, b) => b.rows - a.rows),
    totalRows: counts.reduce((a, b) => a + b.rows, 0),
  };
}

/** ── ② สร้างฐานใหม่ ── ไม่แตะฐานเดิม · มีอยู่แล้วก็คืนตัวเดิม ไม่สร้างซ้ำ */
export async function moveCreate() {
  const exist = await findTarget();
  if (exist) return { created: false, ...exist, note: "มีอยู่แล้ว ไม่สร้างซ้ำ" };
  const r = await api(`/d1/database`, {
    method: "POST",
    body: JSON.stringify({ name: NEW_NAME, primary_location_hint: HINT }),
  });
  return {
    created: true,
    id: r?.uuid,
    name: r?.name,
    region: r?.running_in_region ?? null,
    hintSent: HINT,
    /* ⚠️ Cloudflare อาจไม่ให้โซนตามที่ขอ ⇒ **ต้องอ่าน region ที่คืนมาจริง ห้ามถือว่าได้ตามที่ขอ** */
    note: "ตรวจ region ที่คืนมาว่าตรงกับที่ขอไหม ถ้าไม่ตรงห้ามใช้ต่อ",
  };
}

/** ── ③ ลอกโครงสร้าง ── สร้างตาราง+ดัชนีในฐานใหม่ (idempotent) */
export async function moveSchema() {
  const tgt = await findTarget();
  if (!tgt) return { error: "ยังไม่มีฐานปลายทาง — เรียก ?d1move=create ก่อน" };
  const [tabs, idxs] = await Promise.all([tablesOf(SRC), indexesOf(SRC)]);
  const done = [];
  const failed = [];
  for (const t of tabs) {
    // ⚠️ ใส่ IF NOT EXISTS ให้เอง เพราะ sql ใน sqlite_master เก็บคำสั่งดิบตอนสร้าง
    const sql = t.sql.replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ");
    try {
      await q(tgt.id, sql);
      done.push(t.name);
    } catch (e) {
      failed.push({ name: t.name, error: String(e?.message || e).slice(0, 160) });
    }
  }
  for (const i of idxs) {
    const sql = i.sql.replace(/^CREATE( UNIQUE)? INDEX\s+/i, (m) => `${m.trim()} IF NOT EXISTS `);
    await q(tgt.id, sql).catch((e) => failed.push({ name: i.name, error: String(e?.message || e).slice(0, 160) }));
  }
  return { target: tgt.id, tables: done.length, indexes: idxs.length, failed };
}

/** ── ④ ลอกข้อมูลทีละก้อน ──
 *  เรียกซ้ำได้เรื่อย ๆ · คืน `done:false` แปลว่ายังไม่ครบ ให้เรียกอีก
 *  ⚠️ ใช้ INSERT OR REPLACE + เรียงตาม rowid ⇒ **รันซ้ำได้ ไม่เบิ้ล ไม่ต้องล้างก่อน**
 *  ⚠️ มีเพดานเวลาในตัว เพราะ Netlify ตัดที่ 26 วินาที — หมดเวลาก็คืนตำแหน่งล่าสุดมาให้เรียกต่อ
 */
export async function moveCopy(o = {}) {
  const tgt = await findTarget();
  if (!tgt) return { error: "ยังไม่มีฐานปลายทาง — เรียก ?d1move=create ก่อน" };
  const only = o.table ? String(o.table) : null;
  const deadline = Date.now() + 18000;
  const CHUNK = Math.max(50, Math.min(500, Number(o.chunk) || 200));

  const tabs = (await tablesOf(SRC)).filter((t) => !only || t.name === only);
  const report = [];
  let hitDeadline = false;

  for (const t of tabs) {
    if (Date.now() > deadline) { hitDeadline = true; break; }
    const [srcN, tgtN] = await Promise.all([
      q(SRC, `SELECT COUNT(*) c FROM "${t.name}"`).then((r) => Number(r[0]?.c ?? 0)),
      q(tgt.id, `SELECT COUNT(*) c FROM "${t.name}"`).then((r) => Number(r[0]?.c ?? 0)).catch(() => -1),
    ]);
    if (tgtN < 0) { report.push({ table: t.name, error: "ตารางยังไม่มีในฐานใหม่ — เรียก ?d1move=schema" }); continue; }
    if (tgtN >= srcN) { report.push({ table: t.name, src: srcN, tgt: tgtN, status: "ครบแล้ว" }); continue; }

    const cols = (await q(SRC, `PRAGMA table_info("${t.name}")`)).map((c) => String(c.name));
    let moved = 0;
    /* ⚠️ ตารางเดียวล้มต้องไม่ลากทั้งรอบตาย — จดไว้แล้วไปตารางถัดไป
        ไม่งั้นตารางที่มีปัญหาตัวเดียวจะบล็อกการย้ายทั้งหมดอย่างเงียบ ๆ */
    try {
    let offset = tgtN; // เริ่มต่อจากที่มีอยู่แล้ว (เรียงตาม rowid เหมือนกันทั้งสองฝั่ง)
    while (offset < srcN && Date.now() < deadline) {
      const rows = await q(
        SRC,
        `SELECT ${cols.map((c) => `"${c}"`).join(",")} FROM "${t.name}" ORDER BY rowid LIMIT ${CHUNK} OFFSET ${offset}`
      );
      if (!rows.length) break;
      /* ⚠️ **ต้องแบ่งตามขนาดตัวหนังสือ ไม่ใช่ตามจำนวนแถว** (เจอจริง 5 ก.ย. 2569)
          แบ่ง 300 แถวเท่ากันทุกตาราง ⇒ ตารางที่มีข้อความยาว (contacts · products)
          ทำ SQL ยาวเกินจน D1 ตอบ `SQLITE_TOOBIG` แล้ว**ล้มทั้งรอบ** ไม่ใช่แค่ตารางนั้น
          ⇒ สะสมไปเรื่อย ๆ แล้วยิงเมื่อใกล้เพดาน · แถวยาวมากก็ยิงทีละแถวได้เอง
          ⚠️ เพดาน 80KB เผื่อไว้จากของจริง 100KB — อย่าตั้งชิดขอบ */
      const head = `INSERT OR REPLACE INTO "${t.name}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES `;
      const MAX = 80000;
      let buf = [];
      let bufLen = 0;
      const flush = async () => {
        if (!buf.length) return;
        await q(tgt.id, head + buf.join(","));
        moved += buf.length;
        buf = [];
        bufLen = 0;
      };
      for (const r of rows) {
        const v = `(${cols.map((c) => lit(r[c])).join(",")})`;
        if (bufLen + v.length + 1 > MAX) await flush();
        buf.push(v);
        bufLen += v.length + 1;
      }
      await flush();
      offset += rows.length;
    }
    } catch (e) {
      report.push({ table: t.name, src: srcN, tgt: tgtN + moved, moved, error: String(e?.message || e).slice(0, 160) });
      continue;
    }
    report.push({ table: t.name, src: srcN, tgt: tgtN + moved, moved, status: tgtN + moved >= srcN ? "ครบแล้ว" : "ยังไม่ครบ" });
    if (Date.now() > deadline) { hitDeadline = true; break; }
  }

  const left = report.filter((r) => r.status === "ยังไม่ครบ" || r.error).length;
  return {
    target: tgt.id,
    report,
    done: left === 0 && !hitDeadline,
    hitDeadline,
    // ⚠️ done:false = **ยังไม่ครบ ต้องเรียกซ้ำ** ห้ามเข้าใจว่าล้มเหลว
    note: left === 0 && !hitDeadline ? "ลอกครบทุกตารางแล้ว → เรียก ?d1move=verify" : "ยังไม่ครบ — เรียก ?d1move=copy ซ้ำได้เลย",
  };
}

/** ค่าคงที่สำหรับ SQL — D1 REST ไม่รับ params หลายชุดพร้อมกัน จึงต้องแปลงเป็นตัวหนังสือเอง */
function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  // ⚠️ ต้อง escape เครื่องหมายคำพูดเดี่ยวเสมอ ไม่งั้นชื่อลูกค้าที่มี ' จะทำ SQL พัง
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** ── ⑤ เทียบ ── อ่านอย่างเดียว · ต้องผ่านครบก่อนสับสวิตช์
 *  ⚠️ **เทียบจำนวนแถวอย่างเดียวไม่พอ** — แถวครบแต่ค่าเพี้ยนก็ผ่านได้
 *     จึงเทียบผลรวมของคอลัมน์ตัวเลขทุกคอลัมน์ด้วย
 */
export async function moveVerify() {
  const tgt = await findTarget();
  if (!tgt) return { error: "ยังไม่มีฐานปลายทาง" };
  const tabs = await tablesOf(SRC);
  const out = [];
  for (const t of tabs) {
    /* ⚠️ **ต้องเทียบ "รายชื่อคอลัมน์" ด้วย ไม่ใช่แค่จำนวนแถวกับผลรวม** (เพิ่ม 5 ก.ย. 2569 คืน)
        ของจริงที่เจอ: ลอกโครงจาก `sqlite_master` แล้ว **คอลัมน์ที่เคยเพิ่มด้วย ALTER TABLE หายไป**
        (`orders.ship_amount` และเพื่อน ๆ) ⇒ ฐานใหม่ขาดคอลัมน์ แต่ verify เดิม **ผ่าน 19/19**
        เพราะมันเทียบเฉพาะแถวกับผลรวมของคอลัมน์ที่ **ต้นทาง** มี แล้วบังเอิญไม่โดนตัวที่ขาด
        อาการโผล่ตอนซิงก์จริง: `no such column: ship_amount` ⇒ **ซิงก์ตายทั้งรอบ**
        ⇒ ตัวตรวจต้องครอบสิ่งที่พัง ไม่ใช่ครอบสิ่งที่คิดว่าจะพัง */
    const srcCols = await q(SRC, `PRAGMA table_info("${t.name}")`);
    const tgtColRows = await q(tgt.id, `PRAGMA table_info("${t.name}")`).catch(() => null);
    const srcNames = srcCols.map((c) => String(c.name));
    const tgtNames = tgtColRows ? tgtColRows.map((c) => String(c.name)) : null;
    const missingCols = tgtNames ? srcNames.filter((c) => !tgtNames.includes(c)) : ["(อ่านไม่ได้)"];
    const extraCols = tgtNames ? tgtNames.filter((c) => !srcNames.includes(c)) : [];

    const cols = srcCols;
    const nums = cols
      .filter((c) => /INT|REAL|NUM|DEC|FLOAT|DOUB/i.test(String(c.type || "")))
      .map((c) => String(c.name));
    const expr = ["COUNT(*) AS n", ...nums.map((c) => `ROUND(COALESCE(SUM("${c}"),0),2) AS "s_${c}"`)].join(",");
    const [a, b] = await Promise.all([
      q(SRC, `SELECT ${expr} FROM "${t.name}"`).then((r) => r[0] || {}),
      q(tgt.id, `SELECT ${expr} FROM "${t.name}"`).then((r) => r[0] || {}).catch(() => null),
    ]);
    if (!b) { out.push({ table: t.name, ok: false, why: "อ่านฐานใหม่ไม่ได้", missingCols }); continue; }
    const diffs = Object.keys(a).filter((k) => String(a[k]) !== String(b[k]));
    const colOk = missingCols.length === 0;
    out.push({
      table: t.name,
      rows: a.n,
      ok: diffs.length === 0 && colOk,
      // ⚠️ คอลัมน์ขาด = **ต้องไม่ผ่าน** ต่อให้แถวเท่ากันเป๊ะ — เขียนกลับไม่ได้คือพังของจริง
      ...(missingCols.length ? { missingCols } : {}),
      ...(extraCols.length ? { extraCols } : {}),
      ...(diffs.length ? { diffs, src: a, tgt: b } : {}),
    });
  }
  const bad = out.filter((r) => !r.ok);
  return {
    target: tgt.id,
    tables: out.length,
    passed: out.length - bad.length,
    failed: bad.length,
    /* ⚠️ **ผ่านทุกตารางเท่านั้นถึงจะสับสวิตช์ได้** — ผ่านบางตารางแล้วสับ = ข้อมูลหายบางส่วน
        แล้วจะไม่มีใครรู้จนกว่าจะมีคนเปิดจอนั้นพอดี */
    canSwitch: bad.length === 0,
    /* ⚠️ แถวต่างกันเพราะฐานใหม่รับงานไปแล้ว **เป็นเรื่องปกติหลังสับสวิตช์**
        สิ่งที่ต้องไม่มีคือ `missingCols` — นั่นแปลว่าเขียนกลับไม่ได้จริง */
    colProblems: out.filter((r) => r.missingCols?.length).map((r) => ({ table: r.table, missingCols: r.missingCols })),
    detail: out,
    switchHow: "เปลี่ยน env CORE_D1_ID ที่ Netlify เป็น id ของฐานใหม่ แล้ว deploy · ถอยกลับ = เปลี่ยนกลับค่าเดิม",
  };
}

/** ── ตัวชี้ขาด ── ฐานใหม่เร็วกว่าจริงไหม (ยิงจากในฟังก์ชัน วัดค่าเดินทางล้วน ๆ)
 *
 *  ⚠️ **ต้องวัดก่อนสับสวิตช์เสมอ** — "ย้ายสำเร็จ" กับ "ย้ายแล้วเร็วขึ้น" คนละเรื่องกัน
 *     Cloudflare รับ location hint แบบ "ขอได้ แต่ไม่รับประกัน" ⇒ อาจไปตกโซนเดิม
 *     แล้วเราจะสับสวิตช์ไปฐานที่ไกลเท่าเดิม โดยที่ทุกอย่างดูสำเร็จทุกประการ
 *  ⚠️ ยิงสลับกันไป-มา ไม่ยิงเรียงเป็นชุด — กันผลเพี้ยนจากเน็ตช่วงนั้นเอนไปข้างใดข้างหนึ่ง
 */
export async function movePing(o = {}) {
  const tgt = await findTarget();
  if (!tgt) return { error: "ยังไม่มีฐานปลายทาง" };
  const n = Math.max(3, Math.min(9, Number(o.n) || 5));
  /* 🔴 **ห้ามนับเวลาของรอบที่ล้มเหลวเป็นผลวัด** (แก้ 6 ก.ย. 2569)
      เดิม `.catch(() => null)` แล้วเก็บเวลาไปเลยทุกรอบ ⇒ token ไม่มีสิทธิ์กับฐานปลายทาง
      หรือฐานยังไม่พร้อม ⇒ Cloudflare ตอบ 401/404 **กลับมาเร็วมาก**
      ⇒ ค่ากลางของฐานใหม่ต่ำ ⇒ รายงานว่า "ฐานใหม่เร็วกว่า 250 ms ต่อคำขอ"
      ⇒ **สับสวิตช์ไปฐานที่ยังใช้ไม่ได้** โดยตัววัดยืนยันให้ด้วยความมั่นใจ
      หัวฟังก์ชันนี้เขียนเองว่า "ต้องวัดก่อนสับสวิตช์เสมอ" — แต่ตัววัดต้องพิสูจน์ว่า
      **มันแตะงานจริง** ไม่ใช่แค่ว่ามีตัวเลขออกมา ([[measure-must-prove-work]])
      ⇒ นับเฉพาะรอบที่ได้ `[{ok:1}]` กลับมาจริง · รอบที่ล้มนับแยกแล้วรายงานออกไป */
  const src = [];
  const dst = [];
  let srcFail = 0;
  let dstFail = 0;
  const ping = async (id) => {
    const t = Date.now();
    const rows = await q(id, "SELECT 1 AS ok").catch(() => null);
    const took = Date.now() - t;
    /* พิสูจน์ว่าฐานตอบงานจริง ไม่ใช่แค่ "มีอะไรกลับมา" — 401/404 ก็มีอะไรกลับมาเหมือนกัน */
    const real = Array.isArray(rows) && Number(rows[0]?.ok) === 1;
    return real ? took : null;
  };
  for (let i = 0; i < n; i++) {
    const a = await ping(SRC);
    if (a === null) srcFail++; else src.push(a);
    const b = await ping(tgt.id);
    if (b === null) dstFail++; else dst.push(b);
  }
  /* ⚠️ ไม่มีรอบที่สำเร็จเลย = **ยังตอบไม่ได้** ห้ามคืนค่ากลางของกองว่าง
      (ค่ากลางของ [] เป็น undefined ⇒ เลขคำนวณต่อได้เป็น NaN ซึ่งดูเหมือนผลวัด) */
  if (!src.length || !dst.length) {
    return {
      error: "วัดไม่ได้ — ยังไม่มีรอบที่ฐานตอบงานจริง",
      functionRegion: process.env.AWS_REGION || null,
      source: { id: SRC, ok: src.length, failed: srcFail },
      target: { id: tgt.id, name: tgt.name, region: tgt.region, ok: dst.length, failed: dstFail },
      verdict: "⛔ ห้ามสับสวิตช์จากผลรอบนี้ — ยังพิสูจน์ไม่ได้ว่าฐานปลายทางใช้งานได้",
    };
  }
  const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const ms = med(src);
  const md = med(dst);
  return {
    functionRegion: process.env.AWS_REGION || null,
    /* ⚠️ ต้องรายงาน `failed` ออกไปด้วยเสมอ — ผลวัดที่มาจาก 2 รอบใน 5
        กับที่มาจาก 5 รอบใน 5 เชื่อถือได้ไม่เท่ากัน แต่ค่ากลางหน้าตาเหมือนกันเป๊ะ */
    source: { id: SRC, pings: src, median: ms, failed: srcFail },
    target: { id: tgt.id, name: tgt.name, region: tgt.region, pings: dst, median: md, failed: dstFail },
    fasterBy: `${(ms - md).toFixed(0)} ms ต่อคำขอ`,
    timesFaster: ms && md ? Number((ms / md).toFixed(1)) : null,
    /* ⚠️ เกณฑ์ตัดสิน — เขียนไว้ก่อนเห็นผล จะได้ไม่ตีความเข้าข้างตัวเองทีหลัง */
    verdict:
      md <= 60 && ms - md > 120
        ? "✅ ฐานใหม่ใกล้ฟังก์ชันจริง — คุ้มที่จะสับสวิตช์"
        : md > 150
          ? "🔴 ฐานใหม่ยังไกลเท่าเดิม — location hint ไม่ได้ผล อย่าสับสวิตช์ ยังไม่ได้อะไร"
          : "🟡 ดีขึ้นแต่ไม่มาก — วัดซ้ำหลายรอบก่อนตัดสิน",
  };
}
