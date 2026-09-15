/* 📎 ตัวไล่ดึงสลิปใหม่ตามเวลา — ใบกระดาน t_mu2sow9d (15 ก.ย. 2569)
   ที่มา: เก็บสลิปครบ 381 ไฟล์ ณ 15 ก.ย. 08:12 (slip-archive.mjs · ถังปิด gucut-zort-slips) แต่ ZORT รับสลิปใหม่ทุกวัน
   และ **ไม่มีอะไรดึงซ้ำ** ⇒ วันปิดบัญชี ZORT สลิปหลังวันนั้นหายถาวร [[nothing-triggers-it]]
   ทำ: ไล่ใบขายร้าน z1 ในกระจกย้อน N วัน ครั้งละ ≤8 ใบ → archiveSlips (ข้ามไฟล์ที่เก็บแล้วเอง) → จำตำแหน่งใน core_meta
   📏 วัด 15 ก.ย.: ใบขาย z1 วันละ 18–47 ⇒ ย้อน 3 วัน ~90 ใบ · รอบละ 8 ทุกชั่วโมง ครบรอบในไม่กี่ชั่วโมง
   ⚠️ ร้าน z1 เท่านั้น — zort-files.mjs ใช้รหัส ZORT ร้าน z1 · ร้าน z2 มีสลิปไหมยังไม่รู้ (ห้ามสรุปว่าไม่มี)
   ⚠️ ไม่กรองตามช่องทาง — สงสัยว่าสลิปมาจากช่องทางขายตรงแต่ยังไม่พิสูจน์ ⇒ ไล่ทุกใบ
   ⚠️ ไม่แทนการกวาดครั้งสุดท้ายก่อนปิดบัญชี — ใบเก่ากว่า N วันที่ลูกค้าแนบสลิปทีหลังไม่ถูกไล่ซ้ำ
   ⚠️ archiveSlips ปฏิเสธทั้งชุดถ้ามีเลขที่ใบผิดรูป ⇒ กรองด้วยรูปเดียวกันก่อนส่ง แล้วเลื่อนตำแหน่งข้ามไป ไม่งั้นวนติดชุดเดิม */
const DOCNO = /^[A-Za-z0-9._-]{1,60}$/;
const META_KEY = "slip_scan_cursor";

const thaiDayOffset = (now, back) => new Date(now + 7 * 3600e3 - back * 864e5).toISOString().slice(0, 10);
// กุญแจเรียงลำดับ (วันที่ขาย|เลขที่ใบ) — วันที่เป็น YYYY-MM-DD ไม่มี "|" จึงเทียบข้อความได้ตรงลำดับ
const sortKey = (day, number) => `${day}|${number}`;

export async function slipScanStep(o = {}) {
  const q = o.coreQuery ?? (await import("./coredb.mjs")).coreQuery;
  const archive = o.archiveSlips ?? (await import("./slip-archive.mjs")).archiveSlips;
  const days = Math.max(1, Math.min(30, Number(o.days) || 3));
  const batch = Math.max(1, Math.min(8, Number(o.batch) || 8));
  const now = typeof o.now === "function" ? o.now() : Date.now();
  const since = thaiDayOffset(now, days);

  // อ่านตำแหน่งล้ม = โยน (ไม่เดาว่าเริ่มใหม่ — ไม่งั้นวนดึงชุดแรกซ้ำไม่รู้จบเงียบ ๆ)
  const [meta] = await q(`SELECT v FROM core_meta WHERE k = ?`, [META_KEY]);
  let cursor = null;
  try { cursor = meta?.v ? JSON.parse(meta.v) : null; } catch { cursor = null; }
  const saveCursor = (c) =>
    q(`INSERT INTO core_meta (k,v,at) VALUES (?, ?, datetime('now')) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at`,
      [META_KEY, c ? JSON.stringify(c) : ""]);

  const rows = await q(
    `SELECT number, order_date FROM orders WHERE source = 'z1' AND order_date >= ? AND COALESCE(number,'') <> '' ORDER BY order_date, number`,
    [since]
  );
  const after = cursor ? rows.filter((r) => sortKey(r.order_date, r.number) > sortKey(cursor.day, cursor.number)) : rows;
  if (!after.length) {
    await saveCursor(null);
    return { ok: true, since, wrapped: true, scanned: 0, skippedBad: 0, stored: 0, errors: 0, cursor: null };
  }
  const taken = after.slice(0, batch);
  const good = taken.filter((r) => DOCNO.test(String(r.number)));
  const skippedBad = taken.length - good.length;
  let result = { ok: true, notStarted: [], totals: { stored: 0, errors: 0, bad: 0 } };
  if (good.length) {
    result = await archive({ docnos: good.map((r) => String(r.number)) });
    if (!result?.ok) return { ok: false, since, error: result?.error ?? "archiveSlips ล้ม", cursor }; // ไม่เลื่อนตำแหน่ง
  }
  const notStarted = new Set((result.notStarted ?? []).map(String));
  // เลื่อนถึงใบสุดท้ายที่ "ทำจริง" — ใบผิดรูปนับว่าผ่าน (ข้าม) · ใบที่ไม่ได้เริ่มเพราะหมดเวลาห้ามข้าม
  let last = null;
  for (const r of taken) {
    if (DOCNO.test(String(r.number)) && notStarted.has(String(r.number))) break;
    last = r;
  }
  const next = last ? { day: last.order_date, number: String(last.number) } : cursor;
  if (last) await saveCursor(next);
  return {
    ok: true,
    since,
    wrapped: false,
    scanned: good.length - notStarted.size,
    skippedBad,
    notStarted: [...notStarted],
    stored: Number(result.totals?.stored ?? 0),
    errors: Number(result.totals?.errors ?? 0),
    bad: Number(result.totals?.bad ?? 0),
    cursor: next,
  };
}
