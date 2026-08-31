// อัปไฟล์ขึ้น Cloudflare R2 จากฝั่งเซิร์ฟเวอร์ (ใช้ S3 API + ลายเซ็น SigV4 เขียนเอง)
//
// ทำไมเขียนลายเซ็นเอง ไม่ใช้ @aws-sdk/client-s3:
//   SDK ตัวนั้นหนักหลายเมกและลากพึ่งพามาอีกเป็นสิบ ทำให้ทุกฟังก์ชันในโปรเจกต์
//   โหลดช้าลงหมด ทั้งที่เราต้องการแค่คำสั่งเดียวคือ PutObject
//   ลายเซ็น SigV4 เขียนเองใช้แค่ crypto ที่มีอยู่แล้วใน Node
//
// ใช้กับ: คลิปใต้รีวิวจากมาร์เก็ตเพลส (/api/reviews-ingest)
//   ลิงก์คลิปของ Shopee/Lazada/TikTok มีลายเซ็นและ**หมดอายุใน 2-3 ชม.**
//   จึงต้องดึงไฟล์มาเก็บของเราเองทันทีที่รีวิวเข้ามา ลิงก์ตรงใช้ไม่ได้
//   (กติกาเดียวกับที่เขียนไว้ใน src/lib/types.ts มาแต่เดิม)
//
// ⚠️ ถังนี้ (`gucut-video`) เปิดสาธารณะ เพราะต้องเสิร์ฟที่ video.gucut.com
//    ห้ามเอาอะไรที่มีข้อมูลส่วนตัวมาใส่ (ใบ ลซ.๒ / สลิป / รูปบัตร ต้องอยู่ Blobs เท่านั้น)
//    คลิปรีวิวเป็นของที่ลูกค้าโพสต์สาธารณะบนมาร์เก็ตเพลสอยู่แล้ว จึงวางที่นี่ได้
//
// ⚠️ R2 ไม่ส่ง cache-control มาเอง ต้องติดไปกับไฟล์ตอนอัป (บทเรียน 25 ส.ค. 2569)
import { createHash, createHmac } from "node:crypto";

const REGION = "auto";
const SERVICE = "s3";

export function r2Ready() {
  return !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_ENDPOINT);
}

const sha256hex = (buf) => createHash("sha256").update(buf).digest("hex");
const hmac = (key, str) => createHmac("sha256", key).update(str).digest();

/** คีย์ลงลายเซ็นประจำวัน ตามสูตร AWS SigV4 */
function signingKey(secret, date) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), REGION), SERVICE), "aws4_request");
}

/**
 * อัปไฟล์ขึ้น R2
 * @param {string} key   ที่อยู่บนถัง เช่น "rv/abc123.mp4" (ห้ามขึ้นต้นด้วย /)
 * @param {Buffer} body  เนื้อไฟล์
 * @param {string} type  content-type
 * @param {string} cache ค่า cache-control (ค่าเริ่มต้น 1 ปี — คลิปรีวิวไม่เคยเปลี่ยนเนื้อ)
 */
export async function r2Put(key, body, type, cache = "public, max-age=31536000, immutable") {
  if (!r2Ready()) throw new Error("ยังไม่ได้ตั้งคีย์ R2 ที่ Netlify");
  const bucket = process.env.R2_BUCKET || "gucut-video";
  const endpoint = process.env.R2_ENDPOINT.replace(/\/+$/, "");
  const host = new URL(endpoint).host;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20260831T041500Z
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256hex(body);

  // ⚠️ ต้องเข้ารหัสแต่ละส่วนของ path แยกกัน ห้ามเข้ารหัสทั้งเส้นรวด
  //    ไม่งั้นเครื่องหมาย / กลายเป็น %2F แล้วลายเซ็นไม่ตรง
  const path = `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    "content-type": type,
    "cache-control": cache,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((h) => `${h}:${String(headers[h]).trim()}\n`)
    .join("");

  const canonicalRequest = ["PUT", path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(process.env.R2_SECRET_ACCESS_KEY, date))
    .update(toSign)
    .digest("hex");

  const auth =
    `AWS4-HMAC-SHA256 Credential=${process.env.R2_ACCESS_KEY_ID}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`${endpoint}${path}`, {
    method: "PUT",
    headers: { ...headers, authorization: auth },
    body,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`R2 ตอบ ${res.status} ${detail.slice(0, 200)}`);
  }
  return key;
}

/** ดึงไฟล์จาก URL มาเป็น Buffer — มีเพดานขนาดกันไฟล์ยักษ์ */
export async function fetchBinary(url, maxBytes = 25 * 1024 * 1024, ms = 15000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`โหลดไฟล์ไม่ได้ (${res.status})`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len && len > maxBytes) throw new Error(`ไฟล์ใหญ่เกิน ${Math.round(maxBytes / 1048576)}MB`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`ไฟล์ใหญ่เกิน ${Math.round(maxBytes / 1048576)}MB`);
  return { buf, type: res.headers.get("content-type") || "" };
}
