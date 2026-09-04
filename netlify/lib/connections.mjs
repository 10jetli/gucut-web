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
  if (!at) return { tokenExpiresAtUtc: null, tokenHoursLeft: null };
  return {
    tokenExpiresAtUtc: new Date(at).toISOString(),
    // ปัดลง เพื่อไม่ให้ 0.9 ชม. อ่านเป็น 1 · ติดลบได้ = หมดอายุไปแล้วจริง ๆ
    tokenHoursLeft: Math.floor((at - Date.now()) / 3600e3),
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
          result: (() => {
            try {
              return JSON.parse(row.v || "{}");
            } catch {
              return null;
            }
          })(),
          note: "เวลาเป็น UTC · ตัวต่ออายุวิ่งวันละครั้ง 03:30 น. เวลาไทย",
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
