/* ส่วนกลางของตัวยิง Shopee/TikTok (17 ก.ย. 2569 · gucut2) — **ตัวยิง Lazada ไม่ได้ใช้ไฟล์นี้** (ไม่แตะเส้นที่พิสูจน์แล้ว)
 * กติกาเดียวกับ stock-push-live.mjs ①–⑧ · ใช้แผนซ้ำได้เฉพาะแผนที่ตัวกวาดเพิ่งคิดในคำขอเดียวกัน
 *
 * 🚨 **สมมติฐานของตัวยิงนี้: สัดส่วน "การกระจายสินค้า" ของทุกช่องทาง = 100% (วัด 18 ก.ย. 2569)**
 *    ตัวยิงส่ง "ยอดคงเหลือเต็มจำนวน" ⇒ ถูกต้อง**ก็ต่อเมื่อ**สมมติฐานนี้ยังจริง
 *    ⚠️ ถ้าสัดส่วนเปลี่ยน ตัวยิงจะยิงเลขผิดทันที และ **ไม่มีอะไรฟ้องเลย** (แพลตฟอร์มรับค่าไปตรง ๆ)
 *    ⇒ สมมติฐานที่ไม่มีใครเฝ้า คือคำเตือนหมดอายุใบต่อไป [[warnings-and-i-dont-know-notes-expire]]
 *
 * 🚨 **รายละเอียดที่วัดไว้ — "การกระจายสินค้า" ของ ZORT**
 *    จอ `/Integration/Main` ของ ZORT ตั้งสัดส่วนสต็อกต่อช่องทางได้ · วัดวันนี้: **ทุกช่องทาง 100%**
 *    (TIKTOK · Shopee-gucut · Lazada-gucut · Shopify) ⇒ ตัวยิงที่ส่ง "ยอดคงเหลือเต็มจำนวน" จึงตรงกับที่ ZORT ตั้งใจ
 *    ⚠️ **ถ้าวันหนึ่งมีคนลดสัดส่วนช่องใดช่องหนึ่ง (เช่น Shopee 60%) ตัวยิงนี้จะส่งเลขเต็มทับทันที**
 *       และไม่มีอะไรฟ้อง เพราะแพลตฟอร์มรับค่าไปตรง ๆ ⇒ ของจะถูกเปิดขายเกินที่ร้านตั้งใจ
 *    ⇒ ก่อนเปิดยิงอัตโนมัติเพิ่มช่องทางใหม่ **ต้องเปิดจอนั้นดูสัดส่วนก่อนทุกครั้ง**
 *       (ยังไม่มีเส้น API อ่านค่านี้ — ต้องดูด้วยตาที่จอ ZORT) */
import { getStore } from "@netlify/blobs";
import { แผนใช้ซ้ำได้ไม่เกิน_ms } from "./stock-push-live.mjs";
import { รหัสในใบค้างส่ง, ด่านบนชั้น } from "./stock-push-guards.mjs";

/** ก้อนละไม่เกิน 20 ตัวเลือกต่อสินค้า — หาเพดานจริงด้วยรหัสปลอมไม่ได้ (แพลตฟอร์มหาสินค้าก่อนตรวจขนาด · วัด 17 ก.ย. 21:4x)
 *  ⇒ ตั้งต่ำไว้ก่อน ก้อนที่ถูกปฏิเสธจดรหัสผิดพลาดไว้ให้เห็นเพดานจริง */
export const ตัวเลือกต่อคำขอ = 20;

export function แบ่งก้อน(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** คิดแผน (หรือใช้แผนที่ตัวกวาดเพิ่งคิด) แล้วคัดแถวที่ยิงได้ — คืน { fire, skipped, ที่มาแผน } หรือ { error } */
export async function เตรียมยิง(platform, body, { แผนที่คิดแล้ว = null } = {}, ตรวจที่อยู่) {
  const wantSkus = Array.isArray(body?.skus) ? [...new Set(body.skus.map((s) => String(s).trim()).filter(Boolean))] : [];
  if (!wantSkus.length) return { error: "ต้องระบุ skus เป็นรายการชัดเจน — ไม่มีโหมดยิงทั้งหมด" };
  if (wantSkus.length > 100) return { error: "ครั้งละไม่เกิน 100 รหัส" };

  const อายุแผน = แผนที่คิดแล้ว ? Date.now() - Number(แผนที่คิดแล้ว.คิดเมื่อ) : null;
  const ใช้ซ้ำ = Boolean(แผนที่คิดแล้ว?.plan?.[platform] && Number.isFinite(อายุแผน) && อายุแผน >= 0 && อายุแผน <= แผนใช้ซ้ำได้ไม่เกิน_ms);
  let plan;
  if (ใช้ซ้ำ) plan = แผนที่คิดแล้ว.plan;
  else {
    const { stockPushDryRun } = await import("./stock-push.mjs");
    plan = await stockPushDryRun({ platform, full: true });
  }
  const ที่มาแผน = ใช้ซ้ำ
    ? { planSource: "ตัวกวาดคิดในคำขอเดียวกัน", planAgeMs: อายุแผน }
    : { planSource: "คิดสดในตัวยิง", ...(แผนที่คิดแล้ว ? { planReuseRejected: `แผนที่ส่งมาอายุ ${อายุแผน} ms หรือรูปไม่ครบ ⇒ คิดใหม่` } : {}) };

  const p = plan?.[platform];
  if (!p || p.skip) return { error: `คิดแผนสดไม่ได้: ${p?.skip || `ไม่มีข้อมูล ${platform}`}`, ...ที่มาแผน };
  if (!Array.isArray(p.push)) return { error: "แผนไม่มีรายการเต็ม — ไม่ยิงจากตัวอย่าง", ...ที่มาแผน };
  if ((p.wouldPush ?? 0) > p.push.length) return { error: `แผนสดไม่ครบ: ถือไว้ ${p.push.length} จาก ${p.wouldPush} — ไม่ยิงทั้งรอบ`, ...ที่มาแผน };
  if (!p.locations || typeof p.locations !== "object") return { error: "แผนไม่มีที่อยู่บนแพลตฟอร์ม (ตัวเทียบรุ่นเก่า?) — ไม่เดาที่อยู่ ไม่ยิงทั้งรอบ", ...ที่มาแผน };

  // ⑧ ใบค้างส่ง — อ่านไม่ได้ = ไม่ยิงทั้งรอบ
  const ค้าง = await รหัสในใบค้างส่ง();
  if (ค้าง.error) return { error: `${ค้าง.error} — ตรวจด่าน ⑧ ไม่ได้ ไม่ยิงทั้งรอบ`, ...ที่มาแผน };
  const confirmReopen = new Set(Array.isArray(body?.confirmReopen) ? body.confirmReopen.map((s) => String(s).trim()) : []);

  const byPlan = new Map();
  for (const r of p.push) (byPlan.get(String(r.sku)) || byPlan.set(String(r.sku), []).get(String(r.sku))).push(r);

  const fire = [];
  const skipped = [];
  for (const sku of wantSkus) {
    const rows = byPlan.get(sku);
    if (!rows) { skipped.push({ sku, result: "not_sent", why: "ไม่อยู่ในแผนสดแล้ว (เลขตรงกันอยู่/ของเปลี่ยนระหว่างทาง)" }); continue; }
    const loc = p.locations[sku];
    /* 🔴 รหัสเดียวหลายที่อยู่ ⇒ ไม่ยิง: ดันเลขคลังเต็มทุกรายการ = ประกาศของซ้ำ ขายเกินของที่มี */
    if (rows.length > 1 || !Array.isArray(loc) || loc.length !== 1) {
      skipped.push({ sku, result: "not_sent", why: `รหัสนี้อยู่ ${Array.isArray(loc) ? loc.length : 0} ที่บนแพลตฟอร์ม — ต้องมีที่เดียว (หลายที่ = ขายเกินของ) ต้องให้คนตัดสิน` });
      continue;
    }
    const r = rows[0];
    const ด่าน = ด่านบนชั้น(r, { ค้างส่ง: ค้าง.skus, allowClose: body?.allowClose === true, confirmReopen });
    if (ด่าน) { skipped.push({ sku, result: "not_sent", kind: r.kind, from: r.from, to: r.to, why: ด่าน }); continue; }
    const ที่อยู่ = ตรวจที่อยู่(loc[0]);
    if (typeof ที่อยู่ === "string") { skipped.push({ sku, result: "not_sent", why: ที่อยู่ }); continue; }
    fire.push({ sku, from: r.from, to: r.to, kind: r.kind, ...ที่อยู่ });
  }
  return { fire, skipped, ที่มาแผน, wantSkus, ใบค้างส่ง: ค้าง.orders, p };
}

/** จดประวัติ — ใช้กุญแจเดียวกับ Lazada (`stockpush/log`) แยกด้วย platform · อ่านไม่ได้ = ไม่จด (กันเขียนทับ 50 รอบเดิม) */
export async function จดประวัติ(out) {
  const s = getStore({ name: "gucut-coupon", consistency: "strong" });
  let log;
  try { log = (await s.get("stockpush/log", { type: "json" })) || []; }
  catch { return { ...out, logSkipped: "อ่านประวัติการดันสต็อกไม่ได้ — รอบนี้ไม่ได้จดลงประวัติ (กันเขียนทับของเดิม)" }; }
  log.unshift({
    at: out.at, platform: out.platform,
    fired: out.fired, pushed: out.pushed, rejected: out.rejected, notSent: out.notSent,
    planSource: out.planSource, ...(out.planAgeMs != null ? { planAgeMs: out.planAgeMs } : {}),
    rows: out.results.map(({ raw, ...r }) => r),
  });
  await s.setJSON("stockpush/log", log.slice(0, 50));
  return out;
}

export function สรุปผล(platform, prep, results) {
  return {
    platform,
    requested: prep.wantSkus.length,
    fired: prep.fire.length,
    pushed: results.filter((r) => r.result === "pushed").length,
    rejected: results.filter((r) => r.result === "rejected").length,
    notSent: prep.skipped.length,
    ...prep.ที่มาแผน,
    results: [...results, ...prep.skipped],
    at: new Date().toISOString(),
  };
}

export function สรุปโหมดตรวจ(platform, prep) {
  return {
    dryCheck: true, platform,
    mode: `โหมดตรวจ — ไม่ได้ยิงอะไรขึ้น ${platform} และไม่ได้จดประวัติ`,
    requested: prep.wantSkus.length,
    planRowsHeld: prep.p.push.length, wouldPush: prep.p.wouldPush ?? null,
    wouldFire: prep.fire.length, wouldSkip: prep.skipped.length,
    ใบค้างส่ง: prep.ใบค้างส่ง,
    ...prep.ที่มาแผน,
    fireSample: prep.fire.slice(0, 10), skipSample: prep.skipped.slice(0, 20),
  };
}
