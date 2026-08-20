// Google Ads — ดึงค่าโฆษณาที่ใช้จริง แยกตามแคมเปญ
//
// ⚠️ ทำไมยากกว่า Facebook มาก
//    Facebook ใช้โทเคนใบเดียวจบ · Google ต้องมีของ 5 อย่างพร้อมกัน
//      1. Developer Token   ขอจากบัญชีผู้ดูแล (MCC) — Google ตรวจ 1-3 วัน
//      2. Client ID         จาก Google Cloud Console
//      3. Client Secret     จาก Google Cloud Console
//      4. Refresh Token     ได้จากการกดยินยอมครั้งเดียว
//      5. Customer ID       เลขบัญชีโฆษณา (แบบไม่มีขีด)
//    ขาดข้อไหนก็ดึงไม่ได้ และ Google มักตอบ error สั้น ๆ ไม่บอกว่าขาดอะไร
//    จึงพยายามแปลข้อความ error ให้เป็นภาษาคนที่ท้ายไฟล์นี้
//
// ⚠️ ค่าเงินของ Google เป็น "ไมโคร" ต้องหารล้านเสมอ
//    cost_micros 3830000000 = ฿3,830 — ลืมหารแล้วตัวเลขจะเว่อร์ล้านเท่า

// ⚠️ Google ปลดระวาง API เวอร์ชันเก่าทุกปี ประมาณปีละ 3 เวอร์ชัน
//    ถ้าวันหนึ่งขึ้น error ว่า version ... is not supported ให้ขยับเลขนี้ขึ้น
const API_VERSION = "v21";
const HOST = `https://googleads.googleapis.com/${API_VERSION}`;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** เลขบัญชีของ Google เขียนกันหลายแบบ (745-572-5873) — API รับแต่ตัวเลขล้วน */
export const cleanCustomerId = (v) => String(v ?? "").replace(/[^0-9]/g, "");

/**
 * แลก refresh token เป็น access token ที่ใช้ได้ 1 ชั่วโมง
 * ⚠️ ห้ามเก็บ access token ไว้ใช้ซ้ำข้ามคำขอ — อายุสั้นและไม่คุ้มที่จะจัดการ
 */
async function accessToken({ clientId, clientSecret, refreshToken }) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok || !body?.access_token) {
    throw new Error(explain(body?.error_description || body?.error || `ขอ access token ไม่สำเร็จ (${r.status})`));
  }
  return body.access_token;
}

/** ผลรวมค่าโฆษณาแยกตามแคมเปญ ในช่วงวันที่กำหนด */
export async function googleInsights(cfg, { since, until }) {
  const customerId = cleanCustomerId(cfg.customerId);
  if (!customerId) throw new Error("ยังไม่ได้ใส่เลขบัญชีโฆษณา (Customer ID)");
  if (!cfg.developerToken) throw new Error("ยังไม่ได้ใส่ Developer Token");
  if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) {
    throw new Error("ยังตั้งค่า OAuth ไม่ครบ (ต้องมี Client ID · Client Secret · Refresh Token)");
  }

  const token = await accessToken(cfg);

  // ⚠️ เอาเฉพาะแคมเปญที่มีการใช้เงินจริงในช่วงนั้น ไม่งั้นได้แคมเปญที่หยุดไปแล้วมาเต็มไปหมด
  const query = `
    SELECT campaign.name,
           metrics.cost_micros,
           metrics.clicks,
           metrics.impressions,
           metrics.conversions,
           metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
      AND metrics.cost_micros > 0
  `.trim();

  const headers = {
    authorization: `Bearer ${token}`,
    "developer-token": cfg.developerToken,
    "content-type": "application/json",
  };
  // ต้องส่งเมื่อบัญชีอยู่ใต้บัญชีผู้ดูแล (MCC) — ไม่มีก็ไม่ต้องส่ง
  const login = cleanCustomerId(cfg.loginCustomerId);
  if (login) headers["login-customer-id"] = login;

  const r = await fetch(`${HOST}/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(25000),
  });

  const body = await r.json().catch(() => null);
  if (!r.ok) {
    const g = Array.isArray(body) ? body[0] : body;
    throw new Error(explain(g?.error?.message || g?.error?.details?.[0]?.errors?.[0]?.message || `Google ตอบ ${r.status}`));
  }

  // searchStream คืนเป็น "อาเรย์ของก้อน" แต่ละก้อนมี results ของตัวเอง ต้องรวมเอง
  const chunks = Array.isArray(body) ? body : [body];
  const byName = new Map();
  for (const chunk of chunks) {
    for (const row of chunk?.results || []) {
      const name = row.campaign?.name || "(ไม่มีชื่อ)";
      const cur = byName.get(name) || { name, spend: 0, clicks: 0, impressions: 0, purchases: 0, revenue: 0 };
      cur.spend += num(row.metrics?.costMicros) / 1_000_000;   // ⚠️ ไมโคร → บาท
      cur.clicks += num(row.metrics?.clicks);
      cur.impressions += num(row.metrics?.impressions);
      cur.purchases += num(row.metrics?.conversions);
      cur.revenue += num(row.metrics?.conversionsValue);
      byName.set(name, cur);
    }
  }

  const rows = [...byName.values()];
  rows.sort((a, b) => b.spend - a.spend);
  return rows;
}

// ---------------------------------------------------------------------------
// แปล error ของ Google ให้เป็นภาษาที่เจ้าของร้านอ่านรู้เรื่อง
//
// ⚠️ ข้อความจริงของ Google เป็นอังกฤษล้วนและสั้นมาก เช่น "DEVELOPER_TOKEN_NOT_APPROVED"
//    ถ้าปล่อยไปโชว์ดิบ ๆ เจ้าของร้านจะไม่รู้เลยว่าต้องไปทำอะไรต่อ
//    ต่อท้ายด้วยข้อความเดิมเสมอ เผื่อเจอกรณีที่ยังไม่ได้แปล
// ---------------------------------------------------------------------------
const HINTS = [
  [/DEVELOPER_TOKEN_NOT_APPROVED|not approved/i,
   "Developer Token ยังไม่ผ่านการอนุมัติ — ตอนนี้ใช้ได้กับบัญชีทดสอบเท่านั้น ต้องขอ Basic Access จาก Google ก่อน (รอ 1-3 วัน)"],
  [/DEVELOPER_TOKEN_PROHIBITED|not permitted to access/i,
   "Developer Token นี้ไม่มีสิทธิ์เข้าถึงบัญชีนี้ — ต้องเป็นโทเคนจากบัญชีผู้ดูแลที่คุมบัญชีโฆษณานี้อยู่"],
  [/CUSTOMER_NOT_FOUND|USER_PERMISSION_DENIED/i,
   "ไม่พบบัญชีโฆษณา หรือบัญชี Google ที่กดยินยอมไม่มีสิทธิ์ดูบัญชีนี้ — เช็คเลข Customer ID (ตัวเลขล้วน ไม่ต้องมีขีด)"],
  [/invalid_grant/i,
   "Refresh Token ใช้ไม่ได้แล้ว — ต้องกดยินยอมใหม่เพื่อขอโทเคนใหม่"],
  [/invalid_client/i,
   "Client ID หรือ Client Secret ไม่ถูกต้อง"],
  [/version .* is not supported|is deprecated/i,
   `Google ปลดระวาง API ${API_VERSION} แล้ว — ต้องขยับ API_VERSION ใน netlify/lib/googleads.mjs`],
  [/login-customer-id|MANAGER/i,
   "บัญชีนี้อยู่ใต้บัญชีผู้ดูแล — ต้องใส่เลขบัญชีผู้ดูแล (Login Customer ID) ด้วย"],
];

function explain(msg) {
  const s = String(msg || "");
  for (const [re, th] of HINTS) if (re.test(s)) return `${th}\n(ข้อความจาก Google: ${s})`;
  return s;
}
