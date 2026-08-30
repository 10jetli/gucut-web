// GUCUT Core — ตัวคุยกับฐานข้อมูล D1 (Cloudflare) ผ่าน REST
//
// "คลังเงา" ระยะ 0 ของแผนเลิกจ่าย ZORT (พิมพ์เขียว 30 ส.ค. 2569)
// ฐานชื่อ gucut-core อยู่โซน APAC — Account/DB id ไม่ใช่ความลับ (โผล่ใน URL อยู่แล้ว)
// ความลับมีตัวเดียวคือ CLOUDFLARE_D1_TOKEN (สร้างที่ Cloudflare → API Tokens → สิทธิ์ D1 Edit)
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "f496328a3fb6eac88b6ff64eb4b52fd3";
const DB_ID = process.env.CORE_D1_ID || "28f8e8c7-b7a9-42db-8c69-22be3b11f770";

export function coreReady() {
  return !!process.env.CLOUDFLARE_D1_TOKEN;
}

/** ยิง SQL หนึ่งประโยค (พารามิเตอร์ใช้ ? ตามลำดับ) — คืน rows */
export async function coreQuery(sql, params = []) {
  const token = process.env.CLOUDFLARE_D1_TOKEN;
  if (!token) throw new Error("ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN");
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB_ID}/query`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(15000),
    }
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(`D1 ${res.status}: ${JSON.stringify(data?.errors || data).slice(0, 300)}`);
  }
  return data.result?.[0]?.results ?? [];
}
