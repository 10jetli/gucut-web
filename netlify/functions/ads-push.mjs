// รับตัวเลขค่าโฆษณาจากสคริปต์ที่รันอยู่ใน Google Ads — /api/ads-push
//
// ทำไมต้องมีทางนี้: ศูนย์ API ของ Google เปิดได้เฉพาะ "บัญชีดูแลจัดการ (MCC)"
// ร้านมีแต่บัญชีโฆษณาธรรมดา จะขอ developer token ต้องสร้าง MCC แล้วยื่นให้ Google
// ตรวจอีกหลายวัน — สคริปต์ในบัญชีทำได้เลยวันนี้ และได้ตัวเลขชุดเดียวกัน
//
// ⚠️ ตัวนี้ "ไม่ผ่านด่านรหัสหลังร้าน" เพราะคนเรียกคือเซิร์ฟเวอร์ของ Google
//    ไม่ใช่เบราว์เซอร์ของเจ้าของร้าน จึงต้องมีรหัสของตัวเองและต้องกันเดารหัสเอง
// ⚠️ เทียบรหัสแบบใช้เวลาเท่ากันเสมอ อย่าใช้ === ตรง ๆ
import { ensurePushKey, readConfig, savePushed } from "../lib/adstats.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/** เทียบรหัสโดยไม่บอกใบ้ผ่านเวลาที่ใช้ */
function sameKey(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const cfg = await readConfig();
  // ยังไม่เคยสร้างรหัส = ยังไม่ได้เปิดใช้ทางนี้ ห้ามรับข้อมูลจากใครทั้งนั้น
  const key = cfg.google.pushKey || (await ensurePushKey());
  if (!sameKey(String(body?.key || ""), key)) return json({ error: "unauthorized" }, 401);

  const saved = await savePushed(body?.rows);
  return json({ ok: true, ...saved });
}

export const config = { path: "/api/ads-push" };
