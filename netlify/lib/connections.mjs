// ทะเบียนการเชื่อมต่อ — จอ "ตั้งค่า → การเชื่อมต่อ" แบบ ZORT
//
// ⚠️ **ทุกช่องต้องมาจากการยิงของจริง ห้ามเขียนตายตัวสักบรรทัด**
//    บทเรียน 19 ส.ค. 2569: ตัวตรวจคลิปยิงไปที่อยู่เก่าเลยขึ้นเขียวตลอดกาล
//    ⇒ ตัวตรวจที่เขียวได้ทั้งที่ของจริงพัง อันตรายกว่าไม่มีตัวตรวจ
//
// ⚠️ **สี่สถานะ ไม่ใช่สอง** — ต่างกันคนละความหมาย ห้ามยุบรวม
//    connected: true  = ยิงแล้วตอบกลับจริง
//    connected: false = มีตัวตรวจ แต่ยังไม่ได้เชื่อม (งานที่ยังไม่ได้ทำ)
//    connected: null  = **เราไม่รู้** — แยกได้อีกสองแบบด้วยธง timedOut
//                       timedOut ไม่มี = ยังไม่มีตัวตรวจ · timedOut: true = มีตัวตรวจแต่ปลายทางช้าจนไม่ทัน
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
  if (!at)
    return {
      tokenExpiresAtUtc: null,
      tokenHoursLeft: null,
      tokenMinutesLeft: null,
      tokenExpired: null, // ไม่รู้ ≠ ไม่หมดอายุ
    };
  const leftMs = at - Date.now();
  /* ⚠️ **`tokenHoursLeft: 0` แปลว่า "เหลือไม่ถึงชั่วโมง" ไม่ใช่ "หมดอายุแล้ว"**
      เจอของจริง 5 ก.ย. 2569 ตี 1:26 — จอขึ้นว่า "token หมดอายุแล้ว · ถึง 05/09 01:43 น."
      **ประโยคเดียวขัดกันเอง** (บอกว่าหมดแล้ว แต่บอกเวลาหมดเป็นอนาคต 17 นาทีข้างหน้า)
      เพราะ Math.floor ทำให้ 0.28 ชม. กลายเป็น 0 แล้วฝั่งจออ่าน <= 0 ว่าหมดอายุ
      ⇒ **อย่าให้ปลายทางต้องเดาจากเลขที่ปัดแล้ว** — ส่งคำตอบตรง ๆ ไปเลย
         (คลาสเดียวกับ 0 vs null ที่เจอมาแล้ว แค่ขยับมาอยู่ที่ "ปัดเศษทำให้ความหมายหาย") */
  return {
    tokenExpiresAtUtc: new Date(at).toISOString(),
    // ปัดลง เพื่อไม่ให้ 0.9 ชม. อ่านเป็น 1 · ติดลบ = หมดอายุไปแล้วจริง
    tokenHoursLeft: Math.floor(leftMs / 3600e3),
    // มีไว้ให้ใช้ตอนเหลือน้อยกว่าชั่วโมง จะได้ไม่ต้องโชว์ "เหลือ 0 ชม." ซึ่งอ่านเหมือนหมดแล้ว
    tokenMinutesLeft: Math.floor(leftMs / 60e3),
    // ⚠️ ตัวนี้คือคำตอบจริง ห้ามคำนวณเองจาก tokenHoursLeft
    tokenExpired: leftMs <= 0,
  };
}

/* งบเวลารวมของทั้งหน้า — ต้องต่ำกว่าเพดานของ Netlify (26 วิ) แบบมีที่เหลือ
   ⚠️ **วัดจริงแล้วตอนแคชเย็นใช้ 12.7 วินาที** (ตัวช้าสุดคือ Shopee ที่ต้องไล่ดึงรายการสินค้า)
      ตอนแคชอุ่นเหลือ 1.2–1.5 วิ ⇒ ตอนนี้ยังห่างเพดานครึ่งหนึ่ง
      แต่วันที่ Shopee ช้ากว่าปกติสองเท่า ทั้งหน้าจะ 502 โดยที่เราไม่ได้แก้อะไรเลย
      **และ 502 บอกอะไรไม่ได้เลย** — คนอ่านจะแยกไม่ออกว่า "Shopee ช้า" หรือ "ระบบเราพัง"
      ⇒ ตัดจบเองที่ 18 วิ แล้วตอบ "ช่องนี้ไม่ทัน" แทนการปล่อยให้ทั้งหน้าตาย
      คำตอบบางส่วนที่บอกว่าส่วนไหนไม่ครบ ดีกว่าไม่มีคำตอบเลย */
const BUDGET = 18000;

/* ⚠️ **ทางเดินที่ไม่เคยถูกเรียกใช้ ไม่ต่างจากทางเดินที่ไม่มี** — และมันจะดูปกติทุกประการ
    จนถึงวันที่ต้องใช้จริง ซึ่งเป็นวันที่แย่ที่สุดที่จะมาพบว่ามันพัง
    ตอนยิงทดสอบจริง 5 ก.ย. 2569 แคชอุ่นหมด ทุกช่องตอบใน 0.3–1.2 วิ
    ⇒ **ทางเดิน timeout ไม่เคยถูกวิ่งเลยสักครั้ง** พิสูจน์ไม่ได้ว่ามันทำงาน
    ⇒ เปิดให้ย่องบเวลาลงได้ตอนเรียก (?budget=50) เพื่อบังคับให้ทางนั้นทำงาน
       ค่าตั้งต้นไม่เปลี่ยน · จำกัดช่วง 50–30000 กันตั้งค่าเพี้ยนจนหน้าใช้ไม่ได้ */
export function budgetFrom(raw) {
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n >= 50 && n <= 30000 ? n : BUDGET;
}

async function timed(fn, label = "", budget = BUDGET) {
  const t0 = Date.now();
  try {
    /* ⚠️ ตัวตรวจแต่ละตัวมี timeout ของตัวเองอยู่แล้ว (T) **แต่ไม่ใช่ทุกตัว**
        เช่นตัว Shopee ไปเรียก marketplaceListings() ต่อ ซึ่งยิงหลายรอบและไม่ผูกกับ T
        ⇒ ต้องมีเส้นตายรวมอีกชั้น ไม่งั้นตัวที่ไม่มีเพดานจะลากทั้งหน้าไปตาย */
    const r = await Promise.race([
      fn(),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("__TIMEOUT__")), budget)
      ),
    ]);
    return { ...r, ms: Date.now() - t0 };
  } catch (e) {
    const ms = Date.now() - t0;
    const msg = String(e?.message || e);
    const isTimeout = msg === "__TIMEOUT__" || /timeout|aborted/i.test(msg);
    if (isTimeout) {
      /* ⚠️ **ไม่ทัน ≠ ไม่ได้เชื่อม** — ต้องเป็น null (เราไม่รู้) ไม่ใช่ false (ไม่ได้เชื่อม)
          ตอบ false = จอจะขึ้นว่าเป็นงานค้างที่ต้องไปเชื่อม ทั้งที่อาจเชื่อมอยู่ดี ๆ
          และติดธง timedOut ไว้ต่างหาก เพราะ null เดิมแปลว่า "ยังไม่มีตัวตรวจ"
          สองอย่างนี้คนละเรื่อง ห้ามให้จอเดาเอาจาก null เฉย ๆ */
      return {
        connected: null,
        timedOut: true,
        detail:
          `ตรวจไม่ทันใน ${budget >= 1000 ? Math.round(budget / 1000) + " วินาที" : budget + " มิลลิวินาที"}` +
          ` — ปลายทางช้า ไม่ได้แปลว่าไม่ได้เชื่อม`,
        ms,
      };
    }
    return { connected: false, detail: msg.slice(0, 120), ms };
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
  if (!t) return { connected: false, detail: "ยังไม่ได้กดอนุญาต (ที่ /api/tiktok/auth)" };
  /* บอกชื่อร้านกับจำนวนรหัสที่ลงขาย เหมือนฝั่ง Shopee — "เชื่อมแล้ว" เฉย ๆ พิสูจน์อะไรไม่ได้
     ⚠️ ใช้แคชตัวเดียวกับคอลัมน์ Marketplace (shopee() เรียกไปแล้ว) จึงไม่ยิงซ้ำ
     ⚠️ นับไม่ได้ให้บอกว่าเชื่อมแล้วเฉย ๆ **ห้ามใส่ 0** — 0 อ่านว่า "ไม่มีของลงขายเลย" */
  const { marketplaceListings } = await import("./marketplace-listings.mjs");
  const ml = await marketplaceListings().catch(() => null);
  const n = ml ? Object.values(ml.listings).filter((v) => v.includes("tiktok")).length : null;
  const shop = t.shopName ? `ร้าน ${t.shopName}` : "เชื่อมแล้ว";
  return {
    connected: true,
    ...tokenExpiry(t),
    detail: n === null ? shop : `${shop} · สินค้าที่ลงขาย ${n.toLocaleString("th-TH")} รหัส`,
  };
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

export async function connectionsStatus(opts = {}) {
  const budget = budgetFrom(opts.budget);
  const [z1, z2, sp, tt, lz, ln] = await Promise.all([
    timed(() => zort("z1", "ZORT_STORENAME", "ZORT_APIKEY", "ZORT_APISECRET"), "ZORT z1", budget),
    timed(() => zort("z2", "ZORT_STORENAME_2", "ZORT_APIKEY_2", "ZORT_APISECRET_2"), "ZORT z2", budget),
    timed(shopee, "Shopee", budget),
    timed(tiktok, "TikTok", budget),
    timed(lazada, "Lazada", budget),
    timed(line, "LINE", budget),
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
    /* ⚠️ **เคยเขียนตายตัวว่า "ยังไม่ได้ต่อ"** — วันที่ตั้ง env ครบ บรรทัดนี้จะโกหกทันที
        โดยไม่มีอะไรฟ้อง (คลาสเดียวกับ TikTok ที่เขียนว่า "รอตรวจพาร์ทเนอร์" แล้วเชื่อมได้จริง
        6 ก.ย. 2569 · และป้าย TikTok ในผังสถาปัตยกรรม — เจอ 3 จุดในวันเดียว)
        ⇒ ถามของจริงจาก `peakReady()` ซึ่งเป็นตัวเดียวกับที่ตัวส่งข้อมูลใช้ตัดสินใจ
        ⚠️ "ตั้งคีย์ครบ" ยังไม่เท่ากับ "ส่งข้อมูลได้จริง" — บอกให้ตรงตามที่ตรวจ ห้ามเคลมเกิน */
    accounting: [
      (() => {
        // อ่านตัวแปรตรง ๆ ด้วยเงื่อนไขชุดเดียวกับ peakReady() ใน peak.mjs
        // (ไฟล์นี้ใช้ await import ทั้งไฟล์ แต่ตรงนี้อยู่ในบล็อกสร้าง object ที่ไม่ใช่ async)
        // ⚠️ **เงื่อนไขซ้ำสองที่แล้ว** — แก้ที่ peak.mjs เมื่อไหร่ต้องแก้ตรงนี้ด้วย
        //    ไม่งั้นหน้าจอกับตัวส่งจริงจะตอบคนละอย่างโดยไม่มีอะไรฟ้อง
        const { PEAK_CONNECT_ID, PEAK_CONNECT_KEY, PEAK_USER_TOKEN } = process.env;
        const ready = !!(PEAK_CONNECT_ID && PEAK_CONNECT_KEY && PEAK_USER_TOKEN);
        return stamp({
          name: "PEAK",
          connected: ready,
          detail: ready
            ? "ตั้งคีย์ครบแล้ว (ยังไม่ได้ยิงของจริงจากหน้านี้)"
            : "ยังไม่ได้ใส่คีย์ — ตอนนี้ยอดขายเข้า PEAK ผ่าน ZORT",
        });
      })(),
    ],
    warehouse: [
      stamp({ name: "ZORT — ศีตกาล เทรดดิ้ง", ...z1 }),
      stamp({ name: "ZORT — บัญชีที่สอง (ceojet)", ...z2 }),
    ],
  };

  /* ชีพจรของตัวต่ออายุ token — ตัวมันวิ่งวันละครั้งตี 3 ครึ่ง
     ⚠️ **เขียนชีพจรไว้แล้วแต่ไม่มีใครอ่าน = ไม่ต่างจากไม่มี** (5 ก.ย. 2569)
        token-refresh.mjs บันทึกลง core_meta ตั้งแต่ตอนสร้าง แต่ไม่มี endpoint ไหนคืนมันเลย
        ⇒ เช้ามาถ้าอยากรู้ว่ารอบแรกวิ่งจริงไหม ต้องไปเปิดฐานเอง ซึ่งไม่มีใครทำ
        คืนมาที่หน้านี้ เพราะนี่คือหน้าที่คนจะเปิดดูอยู่แล้วเมื่อสงสัยเรื่องการเชื่อมต่อ
     ⚠️ อ่านไม่ได้ = คืน null **ห้ามเงียบ** — "ไม่รู้" กับ "ไม่เคยวิ่ง" คนละเรื่อง */
  let tokenRefresh = { atUtc: null, note: "อ่านชีพจรไม่ได้ — ไม่ได้แปลว่าไม่เคยวิ่ง" };
  try {
    const { coreQuery } = await import("./coredb.mjs");
    const [row] = await coreQuery(`SELECT at, v FROM core_meta WHERE k = 'token_refresh'`);
    tokenRefresh = row
      ? {
          atUtc: row.at ?? null,
          /* ⚠️ **ก้อนนี้คือ "บันทึกของรอบ 03:30" ไม่ใช่สถานะสด** (ฝั่งจอทักมา 5 ก.ย. 2569)
              ค่า `hoursLeft` ที่ตัวต่ออายุจดไว้ ถูกคิดตอน 03:30 แล้ว **ไม่มีอะไรอัปเดตมันอีกเลย**
              ⇒ บ่ายสองก็ยังเขียนว่า "เหลือ 3 ชั่วโมง" ทั้งที่เวลานั้นผ่านไปแล้ว
                 คนอ่านจะเห็นเวลาหมดอายุที่เลยมาแล้ว แล้วนึกว่าระบบพัง ทั้งที่ต่ออายุไปเรียบร้อย
                 (ของจริงตอนนั้น: ยิง Shopee ผ่าน 5 รอบรวด ⇒ token ใช้ได้ปกติ)
              ⇒ คิด `hoursLeft` ใหม่จาก `expiresAtUtc` ตอนอ่านเสมอ + ติดธง `expired`
              ⚠️ **ห้ามเอาก้อนนี้ไปใช้ตอบว่า "ตอนนี้เชื่อมอยู่ไหม"** — ใช้การ์ดใน `groups` ซึ่งยิงตรวจสด
                 ค่า `connected` ในนี้เป็นความจริงของ 03:30 เท่านั้น ⇒ เปลี่ยนชื่อให้ชัดว่า `connectedAtRun`
              ดูกฎ computed-now-goes-stale */
          result: (() => {
            let v;
            try {
              v = JSON.parse(row.v || "{}");
            } catch {
              return null;
            }
            if (!v || typeof v !== "object") return v ?? null;
            const now = Date.now();
            for (const [k, o] of Object.entries(v)) {
              if (!o || typeof o !== "object") continue;
              if ("connected" in o) {
                o.connectedAtRun = o.connected;
                delete o.connected;
              }
              const exp = o.expiresAtUtc ? Date.parse(o.expiresAtUtc) : NaN;
              if (Number.isFinite(exp)) {
                o.hoursLeft = Math.round((exp - now) / 3600000);
                o.expired = exp <= now;
              } else if ("hoursLeft" in o) {
                // ไม่มีวันหมดอายุให้คิดใหม่ ⇒ ค่าที่จดไว้เชื่อไม่ได้ ทิ้งดีกว่าโชว์ค่าที่เก่า
                delete o.hoursLeft;
                o.hoursLeftNote = "ไม่มี expiresAtUtc ให้คิดใหม่ — ค่าที่จดไว้ตอนรันเก่าไปแล้ว";
              }
              void k;
            }
            return v;
          })(),
          note:
            "เวลาเป็น UTC · ตัวต่ออายุวิ่งวันละครั้ง 03:30 น. เวลาไทย · " +
            "ก้อนนี้คือบันทึกของรอบนั้น ไม่ใช่สถานะสด — hoursLeft/expired คิดใหม่ตอนอ่านแล้ว " +
            "แต่ connectedAtRun เป็นความจริงของตอนรันเท่านั้น อยากรู้ว่าตอนนี้เชื่อมอยู่ไหมให้ดู groups",
        }
      : { atUtc: null, note: "ยังไม่เคยวิ่งสักครั้ง (หรือยังไม่ถึงรอบแรก)" };
  } catch {
    // คงค่าตั้งต้นไว้ — บอกว่าอ่านไม่ได้ ดีกว่าบอกว่าไม่เคยวิ่ง
  }

  const all = Object.values(groups).flat();
  return {
    checkedAt: at,
    connected: all.filter((x) => x.connected === true).length,
    notConnected: all.filter((x) => x.connected === false && !x.retired).length,
    unchecked: all.filter((x) => x.connected === null && !x.timedOut).length,
    // ⚠️ นับแยกจาก unchecked — "ไม่ทัน" คือปัญหาที่ต้องดู ส่วน "ยังไม่มีตัวตรวจ" คืองานที่ยังไม่ได้ทำ
    timedOut: all.filter((x) => x.timedOut).length,
    budgetMs: budget,
    tokenRefresh,
    retired: all.filter((x) => x.retired).length,
    // ⚠️ ข้อความนี้ต้องขึ้นบนจอ — เลขนี้คือ "เท่าที่ตรวจได้" ไม่ใช่ความจริงทั้งหมด
    note:
      "ทุกช่องมาจากการยิงของจริงตอนเปิดหน้านี้ ไม่มีค่าเขียนตายตัว · " +
      "ช่องที่ยังไม่มีตัวตรวจไม่ได้แปลว่าไม่ได้เชื่อม แปลว่าเรายังตรวจไม่ได้ · " +
      "ช่องที่ติดธง timedOut = ปลายทางช้าจนตรวจไม่ทัน ไม่ใช่ไม่ได้เชื่อม",
    groups,
  };
}
