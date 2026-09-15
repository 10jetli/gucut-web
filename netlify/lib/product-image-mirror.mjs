// รูปย่อสินค้าจาก ZORT → ถังเรา (R2 · video.gucut.com/i/<ขั้น>/zort/<hash>.webp) — ใบ t_mu2utot5
//
// ทำไม: ท่านประธานสั่ง "รูปต้องขึ้นทุกรหัส" (15 ก.ย. 2569) · products.image_path (fc52832) เป็นลิงก์ไฟล์ดิบ
//   ส่วนใหญ่อยู่ CDN มาร์เก็ตเพลส (slatic 1,765 · ZORT 309 · shopee 27) ลิงก์ตายได้ และไฟล์ใหญ่ถึง ~2 MB
// ⚠️ Netlify ไม่มี sharp (ห้ามใส่ package.json) ⇒ ย่อบน g1 ด้วย scripts/zort-images-to-r2.mjs แล้วส่งมาที่นี่
// 🔒 ด่าน: sku ต้องมีในทะเบียน และ source ต้องตรง image_path ปัจจุบัน · ไฟล์ต้องเป็น webp จริง (ดูหัวไฟล์ ไม่เชื่อชื่อ)
//    ครบทุกขั้นใน LADDER · ใบละไม่เกิน MAX_BYTES ⇒ ใครได้รหัสไปก็ยัดไฟล์อื่นเข้าถังสาธารณะไม่ได้
import { createHash } from "node:crypto";
import { coreQuery } from "./coredb.mjs";
import { r2Put, r2Ready } from "./r2.mjs";

// ⚠️ ต้องตรงกับ LADDER ใน src/lib/image-loader.js และ STEPS ใน gucut-next/lib/sku-images.ts เป๊ะ
export const LADDER = [128, 256, 384, 640];
const MAX_BYTES = 400 * 1024;

export function isWebp(buf) {
  return !!buf && buf.length > 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
}

/** ชื่อไฟล์คงที่ต่อ (sku, รูปต้นทาง) — รูปต้นทางเปลี่ยน ⇒ ชื่อใหม่ ⇒ cache immutable ปลอดภัย */
export function mirrorName(sku, source) {
  return `zort/${createHash("sha1").update(`${sku}|${source}`).digest("hex").slice(0, 20)}.webp`;
}

export async function saveMirroredImage(body = {}) {
  const sku = String(body.sku ?? "").trim().slice(0, 60);
  const source = String(body.source ?? "").trim();
  if (!sku || !/^https:\/\//.test(source)) return { ok: false, error: "ต้องมี sku และ source (https://…)" };
  const files = body.files && typeof body.files === "object" ? body.files : {};
  const bufs = {};
  for (const step of LADDER) {
    const b64 = files[step] ?? files[String(step)];
    if (typeof b64 !== "string" || !b64) return { ok: false, error: `ขาดรูปขั้น ${step} — ต้องครบ ${LADDER.join("/")}` };
    const buf = Buffer.from(b64, "base64");
    if (!isWebp(buf)) return { ok: false, error: `ขั้น ${step} ไม่ใช่ไฟล์ webp` };
    if (buf.length > MAX_BYTES) return { ok: false, error: `ขั้น ${step} ใหญ่เกิน ${MAX_BYTES} ไบต์ (${buf.length})` };
    bufs[step] = buf;
  }
  const extra = Object.keys(files).filter((k) => !LADDER.includes(Number(k)));
  if (extra.length) return { ok: false, error: `ขั้นที่ไม่รู้จัก: ${extra.join(",")}` };
  if (!r2Ready()) return { ok: false, error: "ยังไม่ได้ตั้ง R2 ที่ Netlify" };

  let row;
  try {
    [row] = await coreQuery(`SELECT sku, image_path FROM products WHERE sku = ?`, [sku]);
  } catch (e) {
    return { ok: false, unknown: true, error: `อ่านทะเบียนสินค้าไม่ได้: ${String(e?.message ?? e).slice(0, 160)}` };
  }
  if (!row) return { ok: false, error: `ไม่มี sku ${sku} ในทะเบียนสินค้า` };
  if (String(row.image_path ?? "") !== source) {
    return { ok: false, error: "source ไม่ตรง image_path ปัจจุบันของ sku นี้ (ZORT อาจเปลี่ยนรูปแล้ว — ซิงก์สินค้าแล้วย่อใหม่)" };
  }

  const name = mirrorName(sku, source);
  for (const step of LADDER) await r2Put(`i/${step}/${name}`, bufs[step], "image/webp");
  // เขียนหลังอัปครบทุกขั้นเท่านั้น — อัปไม่ครบแล้วบันทึกชื่อ = จอขอขั้นที่ไม่มี แล้วรูปหาย
  await coreQuery(`UPDATE products SET image_file = ?, image_file_src = ? WHERE sku = ? AND image_path = ?`, [name, source, sku, source]);
  return { ok: true, sku, file: name, bytes: Object.fromEntries(LADDER.map((s) => [s, bufs[s].length])) };
}
