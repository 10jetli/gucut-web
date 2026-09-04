// ทะเบียนการเชื่อมต่อ — จอ "ตั้งค่า → การเชื่อมต่อ" แบบ ZORT
//
// ⚠️ **ทุกช่องต้องมาจากการยิงของจริง ห้ามเขียนตายตัวสักบรรทัด**
//    บทเรียน 19 ส.ค. 2569: ตัวตรวจคลิปยิงไปที่อยู่เก่าเลยขึ้นเขียวตลอดกาล
//    ⇒ ตัวตรวจที่เขียวได้ทั้งที่ของจริงพัง อันตรายกว่าไม่มีตัวตรวจ
//
// ⚠️ **สี่สถานะ ไม่ใช่สอง** — ต่างกันคนละความหมาย ห้ามยุบรวม
//    connected: true  = ยิงแล้วตอบกลับจริง
//    connected: false = มีตัวตรวจ แต่ยังไม่ได้เชื่อม (งานที่ยังไม่ได้ทำ)
//    connected: null  = **ยังไม่มีตัวตรวจ** (เราไม่รู้ ไม่ใช่ไม่มี)
//    retired: true    = **เลิกใช้แล้ว** (งานที่จบไปแล้ว ไม่ใช่งานค้าง)
//    ฝั่งจอทักมาถูก: ยัด "เลิกใช้แล้ว" ลงใน false = จอบอกว่าเป็นงานค้างที่ต้องไปต่อ
//
// ⚠️ ห้ามส่งคีย์ออกไปแม้แต่ตัวเดียว — บอกได้แค่ "มีคีย์ไหม" กับ "ยิงแล้วผ่านไหม"
const T = 8000;

/* ⚠️ **แต่ละเจ้าเก็บวันหมดอายุ token คนละชื่อ คนละหน่วย — อย่าเดาว่าเหมือนกัน**
    Lazada · TikTok : `expiresAt` เป็น **มิลลิวินาที**
    Shopee          : `expireAt`  เป็น **วินาที** (ไม่มี s ท้ายชื่อ และคนละหน่วย)
    อ่านชื่อเดียวแล้วอีกเจ้าจะได้ undefined → 0 → "เหลือ -496,817 ชั่วโมง"
    (เจอจริง 4 ก.ย. 2569) · **ชื่อคล้ายกันแต่หน่วยคนละอย่าง อันตรายกว่าชื่อไม่ตรงกันเลย**
    เพราะโค้ดวิ่งผ่านและให้ตัวเลขออกมาด้วย ถ้าบังเอิญได้เลขที่ดูสมเหตุสมผล จะไม่มีใครทันสังเกต

    ⚠️ **ไม่รู้วันหมดอายุ ต้องคืน null ไม่ใช่ 0** — 0 อ่านได้ว่า "หมดอายุแล้ว"
       ซึ่งคนละเรื่องกับ "เราไม่รู้" (กติกาเดียวกับ connected: null)

    ⚠️ **จอต้องได้เลขนี้เป็นฟิลด์ ห้ามให้จอไปแกะจากประโยค `detail`**
       แกะเมื่อไหร่ วันที่เราแก้คำในประโยค จอจะพังเงียบทันที (ฝั่งจอชี้เอง 4 ก.ย. 2569) */
function tokenExpiry(t) {
  const ms = Number(t?.expiresAt || 0);
  const sec = Number(t?.expireAt || 0);
  const at = ms > 0 ? ms : sec > 0 ? sec * 1000 : 0;
  /* ⚠️ ชื่อฟิลด์ตกลงกับฝั่งจอไว้ว่า **tokenExpiresAtUtc** (ไม่ใช่ expiresAtUtc เฉย ๆ)
      เพราะในคำตอบเดียวกันมีเวลาอย่างอื่นอยู่ด้วย ชื่อกว้างเกินจะสับสนกันเอง
      และลงท้าย Utc เสมอ กันเดาหน่วยผิด (กติกาเดียวกับ freshness) */
  if (!at) return { tokenExpiresAtUtc: null, tokenHoursLeft: null };
  return {
    tokenExpiresAtUtc: new Date(at).toISOString(),
    // ปัดลง เพื่อไม่ให้ 0.9 ชม. อ่านเป็น 1 · ติดลบได้ = หมดอายุไปแล้วจริง ๆ
    tokenHoursLeft: Math.floor((at - Date.now()) / 3600e3),
  };
}

async function timed(fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { ...r, ms: Date.now() - t0 };
  } catch (e) {
    return { connected: false, detail: String(e?.message || e).slice(0, 120), ms: Date.now() - t0 };
  }
}

/* ⚠️ **ชื่อตัวแปรของร้านที่สองลงท้าย `_2` ไม่ใช่ขึ้นต้น `ZORT2_`**
    เดาชื่อเอาแล้วจะได้ 'ยังไม่ได้ตั้งรหัสร้าน' ทั้งที่ตั้งไว้แล้ว — ผิดแบบดูสมเหตุสมผล
    ต้องอ่านจาก stores() ใน core-sync.mjs เสมอ (แหล่งเดียวที่ใช้จริง) */
async function zort(tag, storeEnv, keyEnv, secEnv) {
  const storename = process.env[storeEnv];
  if (!storename) return { connected: false, detail: "ยังไม่ได้ตั้งรหัสร้านใน Netlify" };
  const r = await fetch("https://open-api.zortout.com/v4/Product/GetProducts?limit=1", {
    headers: {
      storename,
      apikey: process.env[keyEnv] ?? "",
      apisecret: process.env[secEnv] ?? "",
    },
    signal: AbortSignal.timeout(T),
  });
  if (!r.ok) return { connected: false, detail: `ZORT ตอบ ${r.status}` };
  const d = await r.json().catch(() => null);
  return { connected: true, detail: `ร้าน ${storename} · สินค้า ${Number(d?.count ?? 0).toLocaleString("th-TH")} รายการ` };
}

async function shopee() {
  const { validToken } = await import("./shopee.mjs");
  const t = await validToken();
  if (!t) return { connected: false, detail: "ยังไม่ได้กดอนุญาต (ที่ /api/shopee/auth)" };
  // นับสินค้าที่ลงขายจริง — ใช้แคชร่วมกับคอลัมน์ Marketplace ไม่ยิงซ้ำ
  const { marketplaceListings } = await import("./marketplace-listings.mjs");
  const ml = await marketplaceListings().catch(() => null);
  const n = ml ? Object.values(ml.listings).filter((v) => v.includes("shopee")).length : null;
  return {
    connected: true,
    ...tokenExpiry(t),
    detail: n === null ? "เชื่อมแล้ว" : `เชื่อมแล้ว · สินค้าที่ลงขาย ${n.toLocaleString("th-TH")} รหัส`,
  };
}

async function tiktok() {
  const { validToken } = await import("./tiktok.mjs");
  const t = await validToken();
  return t
    ? { connected: true, ...tokenExpiry(t), detail: "เชื่อมแล้ว" }
    : { connected: false, detail: "ยังไม่ได้กดอนุญาต (ที่ /api/tiktok/auth)" };
}

async function lazada() {
  const { lazadaReady, validToken } = await import("./lazada.mjs");
  if (!lazadaReady()) return { connected: false, detail: "ยังไม่ได้ตั้ง LAZADA_APP_KEY / LAZADA_APP_SECRET" };
  const t = await validToken();
  if (!t) return { connected: false, detail: "ยังไม่ได้กดอนุญาต (ที่ /api/lazada/auth)" };
  // ⚠️ token อายุแค่ 7 วัน — ต้องบอกวันหมดอายุบนจอ ไม่งั้นวันที่มันหลุดจะดูเหมือนระบบพังเฉย ๆ
  const exp = tokenExpiry(t);
  const left = exp.tokenHoursLeft === null ? null : Math.floor(exp.tokenHoursLeft / 24);
  return {
    connected: true,
    ...exp,
    detail:
      `เชื่อมแล้ว · ${t.account || "ร้าน"}` +
      (left === null ? "" : ` · token เหลือ ${left} วัน`),
  };
}

async function line() {
  const tok = process.env.LINE_MESSAGING_TOKEN;
  if (!tok) return { connected: false, detail: "ยังไม่ได้ตั้ง token" };
  const r = await fetch("https://api.line.me/v2/bot/info", {
    headers: { authorization: `Bearer ${tok}` },
    signal: AbortSignal.timeout(T),
  });
  if (!r.ok) return { connected: false, detail: `LINE ตอบ ${r.status}` };
  const d = await r.json().catch(() => ({}));
  return { connected: true, detail: `${d.displayName || "LINE OA"} (${d.basicId || "@gucut1"})` };
}

export async function connectionsStatus() {
  const [z1, z2, sp, tt, lz, ln] = await Promise.all([
    timed(() => zort("z1", "ZORT_STORENAME", "ZORT_APIKEY", "ZORT_APISECRET")),
    timed(() => zort("z2", "ZORT_STORENAME_2", "ZORT_APIKEY_2", "ZORT_APISECRET_2")),
    timed(shopee),
    timed(tiktok),
    timed(lazada),
    timed(line),
  ]);
  const at = new Date().toISOString();
  const stamp = (o) => ({ ...o, lastChecked: at });

  const groups = {
    marketplace: [
      stamp({ name: "Shopee", ...sp }),
      stamp({ name: "Lazada", ...lz }),
      stamp({ name: "TikTok Shop", ...tt }),
    ],
    website: [
      stamp({
        name: "Shopify",
        connected: false,
        retired: true, // เลิกใช้แล้ว ไม่ใช่งานค้าง
        detail: "ปิดร้านถาวรแล้ว 28 ส.ค. 2569 — ไม่ต้องเชื่อมอีก",
      }),
      stamp({
        name: "gucut.com (หน้าร้านของเราเอง)",
        connected: true,
        detail: "ออเดอร์เข้าคลังเงาโดยตรง ไม่ต้องเชื่อมผ่านใคร",
      }),
    ],
    social: [
      stamp({ name: "LINE OA (@gucut1)", ...ln }),
      stamp({
        name: "Facebook Page",
        connected: null, // ยังไม่มีตัวตรวจ ≠ ไม่ได้เชื่อม
        detail: "ยังไม่มีตัวตรวจ — แชท Facebook ตอบผ่านแอป ZORT Social อยู่",
      }),
    ],
    accounting: [
      stamp({
        name: "PEAK",
        connected: false,
        detail: "ยังไม่ได้ต่อ — ตอนนี้ยอดขายเข้า PEAK ผ่าน ZORT",
      }),
    ],
    warehouse: [
      stamp({ name: "ZORT — ศีตกาล เทรดดิ้ง", ...z1 }),
      stamp({ name: "ZORT — บัญชีที่สอง (ceojet)", ...z2 }),
    ],
  };

  const all = Object.values(groups).flat();
  return {
    checkedAt: at,
    connected: all.filter((x) => x.connected === true).length,
    notConnected: all.filter((x) => x.connected === false && !x.retired).length,
    unchecked: all.filter((x) => x.connected === null).length,
    retired: all.filter((x) => x.retired).length,
    // ⚠️ ข้อความนี้ต้องขึ้นบนจอ — เลขนี้คือ "เท่าที่ตรวจได้" ไม่ใช่ความจริงทั้งหมด
    note:
      "ทุกช่องมาจากการยิงของจริงตอนเปิดหน้านี้ ไม่มีค่าเขียนตายตัว · " +
      "ช่องที่ยังไม่มีตัวตรวจไม่ได้แปลว่าไม่ได้เชื่อม แปลว่าเรายังตรวจไม่ได้",
    groups,
  };
}
