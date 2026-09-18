/* 💸 การเงินมาร์เก็ตเพลส — ดึงรายการเงินจาก Shopee · Lazada · TikTok แล้วทำให้เป็น "รูปเดียวกัน"
   ใบกระดาน t_mu2xtzr2 · เขียน 18 ก.ย. 2569 (ต่อจากตัวตรวจสิทธิ์ mkp-finance-probe.mjs)

   ทำไปทำไม: หน้า Marketplace ของ ZORT (/Dashboard/MKPReport) โชว์ยอดเงินที่แพลตฟอร์มโอนเข้าจริง
   (รอบบัญชี · ค่าส่ง · คอมมิชชั่น · ค่าธรรมเนียมชำระเงิน · รายได้จาก Platform)
   ⇒ เลิกจ่าย ZORT ได้ต้องมีของแทน · ข้อมูลมาจาก **API ของแต่ละเจ้าโดยตรง** ไม่ผ่าน ZORT

   🔴 ขั้นนี้ยัง **ไม่เขียนลงฐาน** โดยตั้งใจ — ใบงานสั่งว่า "พิสูจน์การจับคู่คอลัมน์กับค่าจริงก่อน"
      เขียนลงฐานก่อนรู้ว่าคอลัมน์ไหนคืออะไร = ได้ตารางที่ดูสมบูรณ์แต่ความหมายผิด แก้ทีหลังยากกว่า
      (ตระกูลเดียวกับ [[field-answers-other-question]])

   🔒 ข้อห้ามเรื่องข้อมูลส่วนบุคคล — ผิดข้อนี้คือปัญหาจริง ไม่ใช่เรื่องสไตล์
   ⚠️ Shopee ส่ง `buyer_name` มาในรายการกระเป๋าเงิน · Lazada ส่ง `seller_sku`/`details` ที่มีข้อความอิสระ
      ⇒ ตัวนี้ **คัดเฉพาะช่องที่ระบุไว้** (allowlist) ห้ามส่งของดิบทั้งก้อนออกไป
      repo เป็น public และคำตอบอาจถูกก๊อปลง log ⇒ ชื่อผู้ซื้อห้ามออกจากที่นี่เด็ดขาด

   ⚠️ **หน่วยเงินกับความหมายของ "amount" ของสามเจ้าไม่เหมือนกัน** — ห้ามบวกรวมกันข้ามเจ้า
      · Shopee  = รายการเดินบัญชีกระเป๋าเงิน (เข้า/ออก) ⇒ ต้องดู money_flow ประกอบ
      · Lazada  = **รายการค่าธรรมเนียมรายบรรทัด** (fee_name/fee_type) ⇒ หนึ่งออเดอร์มีหลายแถว
      · TikTok  = **ใบสรุปรอบโอนเงิน (statement)** ⇒ หนึ่งแถว = หนึ่งรอบ มีค่าธรรมเนียมแยกช่องแล้ว
      ⇒ ทุกแถวจึงพ่วง `grain` ("wallet-txn" · "fee-line" · "statement") ให้คนอ่านรู้ว่ากำลังดูของระดับไหน
      ไม่มี grain = วันหนึ่งจะมีคนเอาสามเจ้ามาบวกกันแล้วได้เลขที่ไม่มีความหมาย
*/

/** ข้อความ error ที่ปลอดภัยพอจะส่งออกไป — ซ่อนทุกคำที่เป็นความลับ **ไม่ใช่แค่ access_token**
 *  ⚠️ ฝั่งจอทักไว้ 18 ก.ย. 2569: วันหนึ่ง error อาจมี `app_key` หรือ `sign` ติดมา แล้วเราจะปล่อยหลุด
 *     (repo นี้ public และคำตอบถูกก๊อปลงรายงานได้) ⇒ กันแบบรายชื่อคำ ไม่ใช่กันเฉพาะตัวที่เคยเจอ */
const SECRET_KEYS = /(access_token|refresh_token|app_key|app_secret|sign|signature|code|shop_cipher)=[^&\s]+/gi;
const cleanErr = (e) => String(e?.message ?? e).replace(SECRET_KEYS, (m) => `${m.split("=")[0]}=<ซ่อน>`).slice(0, 200);
const ymd = (d) => d.toISOString().slice(0, 10);

/** ตัวเลขจากข้อความ — คืน null เมื่ออ่านไม่ได้ (ห้ามคืน 0: "อ่านไม่ได้" ≠ "ศูนย์บาท") */
export function money(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** วินาที/มิลลิวินาที epoch → วันไทย (YYYY-MM-DD) · ไม่มีค่า = null
 *  ⚠️ ร้านอยู่ไทย เซิร์ฟเวอร์รัน UTC ⇒ ต้องบวก 7 ชม. ก่อนตัดวัน ไม่งั้นรายการช่วงเช้าตกไปวันก่อน */
export function thaiDay(epoch, { ms = false } = {}) {
  if (epoch === null || epoch === undefined || epoch === "") return null;
  const n = Number(epoch);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date((ms ? n : n * 1000) + 7 * 3600e3).toISOString().slice(0, 10);
}

/* ── การจับคู่คอลัมน์ (ชื่อช่องจริงที่ยิงเจอ 18 ก.ย. 2569) ─────────────────────────
   ⚠️ ชื่อช่องมาจากผลยิงจริง ไม่ใช่จากเอกสาร — ดู ?mkpfinanceprobe=1
   ⚠️ ช่องที่ยังไม่แน่ใจความหมาย **ไม่จับคู่** ปล่อยให้ไปอยู่ใน fieldsSeen ให้คนตัดสิน
      (เดาความหมายแล้วใส่ช่องสวย ๆ = คนอ่านเชื่อว่าเราตรวจแล้ว ทั้งที่เราเดา) */

export function mapShopee(t) {
  return {
    platform: "shopee",
    grain: "wallet-txn",
    id: t?.transaction_id != null ? String(t.transaction_id) : null,
    day: thaiDay(t?.create_time),
    type: t?.transaction_type ?? null,
    flow: t?.money_flow ?? null,          // Shopee บอกทิศทางเงินแยกช่อง ⇒ ค่าเป็นบวกเสมอ
    /* 🔒 **ชื่อช่องเงินต่างกันตาม grain โดยตั้งใจ** (ฝั่งจอเสนอ 18 ก.ย. 2569)
       เดิมทั้ง Shopee กับ Lazada ใช้ชื่อ `amount` ⇒ ใครเขียน results.flatMap(rows).reduce บวก amount
       จะได้ตัวเลขผิดทันทีโดยไม่มีอะไรฟ้อง (เงินสองระดับคนละความหมาย)
       ⇒ ตั้งชื่อให้ต่างกัน ⇒ บวกมั่วแล้วได้ undefined/NaN ซึ่งเห็นทันที
       🔑 กันด้วยโครงสร้างดีกว่ากันด้วยคำเตือนที่ต้องอ่าน */
    walletAmount: money(t?.amount),
    balanceAfter: money(t?.current_balance),
    orderRef: t?.order_sn ?? null,
    refundRef: t?.refund_sn ?? null,
    status: t?.status ?? null,
    /* 🔒 ไม่เอา: buyer_name (ชื่อผู้ซื้อ) · description/reason/remarks (ข้อความอิสระ อาจมีชื่อคน) */
  };
}

/** วันของ Lazada — เขาส่งเป็น **"01 Sep 2026"** ไม่ใช่ ISO (วัดจริง 18 ก.ย. 2569)
 *  🔴 เดิมเขียน `String(...).slice(0, 10)` เพราะเหมาว่าเป็น YYYY-MM-DD
 *     ⇒ ได้ **"01 Sep 202"** (ปีขาดหลัก) ซึ่ง **ดูเหมือนวันที่** แต่เอาไปเรียง/จัดกลุ่มไม่ได้เลย
 *     และไม่มีอะไรฟ้อง เพราะมันยังเป็นสตริงที่ไม่ว่าง [[field-answers-other-question]]
 *  ⇒ แปลงเป็น YYYY-MM-DD จริง · อ่านไม่ออก = **null** (ห้ามคืนสตริงที่ตัดครึ่ง)
 *  ⚠️ วันนี้เป็นวันตามปฏิทินที่ Lazada ออกรายการให้แล้ว **ไม่ต้องบวก 7 ชม.ซ้ำ** (ต่างจาก epoch ของ Shopee/TikTok) */
const MONTHS = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
export function lazadaDay(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);          // เผื่อวันหนึ่งเขาเปลี่ยนเป็น ISO
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/); // "01 Sep 2026"
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  return null;
}

export function mapLazada(r) {
  return {
    platform: "lazada",
    grain: "fee-line",
    id: r?.transaction_number != null ? String(r.transaction_number) : null,
    day: lazadaDay(r?.transaction_date),
    /* เก็บค่าดิบของวันไว้ด้วย — ถ้าแปลงไม่ออก คนไล่ปัญหาต้องเห็นว่าต้นทางส่งอะไรมา
       (ไม่ใช่ข้อมูลส่วนบุคคล เป็นแค่รูปแบบวันที่) */
    dayRaw: r?.transaction_date ? String(r.transaction_date).slice(0, 40) : null,
    type: r?.transaction_type ?? null,
    feeName: r?.fee_name ?? null,
    feeType: r?.fee_type ?? null,
    feeLineAmount: money(r?.amount),   // ดู 🔒 ที่ mapShopee — ชื่อต่างกันตาม grain โดยตั้งใจ
    vatIn: money(r?.VAT_in_amount),
    wht: money(r?.WHT_amount),
    orderRef: r?.order_no ?? null,
    orderItemRef: r?.orderItem_no ?? null,
    /* `statement` ของ Lazada = **ช่วงวันของรอบจ่ายเงิน** เช่น "01 Sep 2026 - 01 Sep 2026"
       ⇒ ตรงกับคอลัมน์ "รอบบัญชี" ของ ZORT ซึ่งเป็นช่วงวัน ไม่ใช่เลขที่เอกสาร (ฝั่งจอยืนยัน 18 ก.ย. 2569) */
    statement: r?.statement ?? null,
    paidStatus: r?.paid_status ?? null,
    /* 🔒 ไม่เอา: seller_sku · lazada_sku · details · comment (ข้อความอิสระ) */
  };
}

export function mapTiktok(s) {
  return {
    platform: "tiktok",
    grain: "statement",
    id: s?.id != null ? String(s.id) : null,
    day: thaiDay(s?.statement_time),
    paidDay: thaiDay(s?.payment_time),
    currency: s?.currency ?? null,
    settlement: money(s?.settlement_amount),
    revenue: money(s?.revenue_amount),
    netSales: money(s?.net_sales_amount),
    fee: money(s?.fee_amount),
    shippingCost: money(s?.shipping_cost_amount),
    adjustment: money(s?.adjustment_amount),
    paymentStatus: s?.payment_status ?? null,
    paymentRef: s?.payment_id != null ? String(s.payment_id) : null,
  };
}

/** ชื่อช่องที่ต้นทางส่งมา **ในหน้านี้เท่านั้น** (ไม่รวมค่า) — ให้คนเห็นว่ามีอะไรที่เรายังไม่ได้ใช้
 *  ⚠️ ส่ง **ชื่อ** เท่านั้น ห้ามส่งค่า — ช่องที่เราไม่ได้จับคู่มีทั้งชื่อผู้ซื้อและข้อความอิสระ
 *  🔴 **ชื่อช่องที่ไม่โผล่ในหน้านี้ ไม่ได้แปลว่าแพลตฟอร์มไม่ส่ง** (ฝั่งจอทัก 18 ก.ย. 2569)
 *     และชื่อที่โผล่ก็ไม่ได้แปลว่ามีค่า ⇒ จึงตั้งชื่อฟิลด์ว่า `fieldsSeenThisPage` ให้ขอบเขตติดมากับชื่อ */
const fieldsOf = (rows) => {
  const s = new Set();
  for (const r of rows || []) for (const k of Object.keys(r || {})) s.add(k);
  return [...s].sort();
};

async function one(platform, fn) {
  try {
    return { platform, ...(await fn()) };
  } catch (e) {
    const msg = cleanErr(e);
    /* สามสถานะ: skip = ยังไม่เชื่อมร้าน (ทำต่อไม่ได้) · ok:false = เรียกแล้วไม่ผ่าน · ok:true = ได้ของ
       ⚠️ ห้ามยุบ skip กับ error เป็นอันเดียว — "ยังไม่เชื่อม" ไม่ใช่ "พัง" */
    if (/ยังไม่ได้เชื่อมร้าน/.test(msg)) return { platform, skip: msg };
    return { platform, ok: false, error: msg };
  }
}

/**
 * ดึงรายการเงินของสามเจ้าในช่วง N วันย้อนหลัง แล้วคืนเป็นรูปเดียวกัน
 * @param days ย้อนหลังกี่วัน (1–90 · เกินนั้นตัด — เส้นการเงินของทุกเจ้าจำกัดช่วงวัน)
 * @param limit จำนวนแถวต่อเจ้า (1–100 · กันดึงยาวจนฟังก์ชันหมดเวลา 26 วิ ของ Netlify)
 * @param page หน้าที่เท่าไหร่ (เริ่ม 0) — **สามเจ้าเลื่อนหน้าไม่เหมือนกัน**
 *   · Shopee `page_no` (นับหน้า) · Lazada `offset` (นับแถว = page × limit) · TikTok ใช้ **โทเคน** ไม่ใช่เลขหน้า
 *   ⚠️ TikTok จึงรับ `pageToken` แทน — ส่ง `page` ให้ TikTok ไม่มีผล และ **ห้ามแกล้งคิดโทเคนจากเลขหน้า**
 *     (ตระกูล [[similar-name-other-unit]] ชื่อคล้ายกันแต่หน่วยคนละอย่าง)
 * @param pageToken โทเคนหน้าถัดไปของ TikTok (ได้จาก nextPageToken ของรอบก่อน)
 * @param to วันสุดท้ายของช่วง (YYYY-MM-DD · ไม่ส่ง = วันนี้) — ใช้เลื่อนหน้าต่างย้อนหลังทีละช่วง
 *
 * 🔴 **Shopee จำกัดช่วงวันไม่ให้ถึง 15 วัน** (วัดจริง 18 ก.ย. 2569: 14 วันได้ · 15 วันขึ้นไป
 *    ตอบ `wallet.time_invalid: time period too large`) ⇒ ตัวนี้ **หดช่วงของ Shopee ให้เหลือ 14 วันเอง**
 *    แล้วติดป้าย `windowDays` + `windowClamped` บอกว่าหดแล้ว
 *    ⚠️ ถ้าไม่หดให้: ขอ 30 วัน ⇒ Shopee ตอบ error ⇒ **คนอ่านเห็นแถวว่างแล้วสรุปว่า "เดือนนี้ไม่มีรายการ"**
 *       (ผมเกือบสรุปแบบนั้นเองตอนไล่กอง — เห็น rows ว่างโดยไม่ได้ดู ok/error) [[http-200-empty-payload]]
 *    ⚠️ อยากได้ย้อนไกลกว่า 14 วัน ต้องเลื่อน `to` ถอยหลังทีละช่วง ไม่ใช่เพิ่ม `days`
 *
 * ⚠️ **หนึ่งเจ้าล้ม ห้ามลากอีกสองเจ้า** — คืนผลรายเจ้า (ok/error/skip) แยกกันเสมอ
 * ⚠️ `truncated` = ได้เท่าที่ขอ อาจมีมากกว่านี้ ⇒ จอห้ามเขียนว่า "ทั้งหมด"
 */
export async function readMarketplaceFinance(opts = {}, deps = {}) {
  const days = Math.max(1, Math.min(90, parseInt(opts.days ?? "7", 10) || 7));
  const limit = Math.max(1, Math.min(100, parseInt(opts.limit ?? "20", 10) || 20));
  const page = Math.max(0, Math.min(500, parseInt(opts.page ?? "0", 10) || 0));
  const pageToken = String(opts.pageToken ?? "").slice(0, 400);
  const now = deps.now ? new Date(deps.now) : new Date();
  /* วันสุดท้ายของช่วง — ส่ง to= มาได้เพื่อเลื่อนหน้าต่างย้อนหลัง · รูปแบบผิด = ใช้วันนี้ (ห้ามพังทั้งคำขอ) */
  const toRaw = String(opts.to ?? "").trim();
  const toOk = /^\d{4}-\d{2}-\d{2}$/.test(toRaw) && !Number.isNaN(Date.parse(`${toRaw}T23:59:59Z`));
  /* 🔴 **ค่าที่ใช้ไม่ได้ต้องประกาศตัว ห้ามเงียบ** (ฝั่งจอทัก 18 ก.ย. 2569)
     เดิม: ส่ง to= ผิดรูป ⇒ ใช้วันนี้แทนแบบไม่บอกใคร ⇒ คนเชื่อว่าได้ช่วงที่ขอ ทั้งที่ได้ช่วงอื่น
     (คลาสเดียวกับ [[fallbacks-must-announce]] และ "ตัวกรองที่ดูเหมือนใช้แล้วแต่ไม่ได้กรอง")
     ⇒ ยังไม่พังคำขอ (ทางถอยยังทำงาน) แต่ติดธง toIgnored ให้จอเขียนบอกคนใช้ได้ */
  const toIgnored = Boolean(toRaw) && !toOk;
  const end = toOk ? new Date(`${toRaw}T23:59:59Z`) : now;
  const from = new Date(end.getTime() - days * 864e5);
  /* ⚠️ Shopee: ช่วงต้องน้อยกว่า 15 วัน ⇒ หดให้เหลือ 14 วันนับจากวันสุดท้ายเดียวกัน */
  const SHOPEE_MAX_DAYS = 14;
  const shopeeDays = Math.min(days, SHOPEE_MAX_DAYS);
  const shopeeFrom = new Date(end.getTime() - shopeeDays * 864e5);

  const shopee = deps.shopee ?? (await import("./shopee.mjs")).shopCall;
  const lazada = deps.lazada ?? (await import("./lazada.mjs")).shopCall;
  const tiktok = deps.tiktok ?? (await import("./tiktok.mjs")).shopCall;

  const results = await Promise.all([
    one("shopee", async () => {
      const d = await shopee("/api/v2/payment/get_wallet_transaction_list", {
        page_no: String(page), page_size: String(limit),
        create_time_from: String(Math.floor(shopeeFrom.getTime() / 1000)),
        create_time_to: String(Math.floor(end.getTime() / 1000)),
      });
      const raw = d?.response?.transaction_list ?? [];
      return {
        ok: true, grain: "wallet-txn", rows: raw.map(mapShopee), count: raw.length,
        truncated: Boolean(d?.response?.more) || raw.length >= limit,
        fieldsSeenThisPage: fieldsOf(raw),
        windowDays: shopeeDays,
        windowClamped: shopeeDays < days,
        scope: `รายการเดินบัญชีกระเป๋าเงิน Shopee ${ymd(shopeeFrom)}–${ymd(end)} (≤${limit} แถว)` +
          (shopeeDays < days
            ? ` ⚠️ **หดช่วงจาก ${days} วันเหลือ ${shopeeDays} วัน** เพราะ Shopee ไม่รับช่วง ≥15 วัน`
            : ""),
      };
    }),
    one("lazada", async () => {
      const d = await lazada("/finance/transaction/details/get", {
        /* Lazada เลื่อนหน้าด้วย **จำนวนแถว** ไม่ใช่เลขหน้า ⇒ ต้องคูณด้วย limit เอง */
        start_time: ymd(from), end_time: ymd(end), limit: String(limit), offset: String(page * limit),
      });
      const raw = Array.isArray(d?.data) ? d.data : [];
      return {
        ok: true, grain: "fee-line", rows: raw.map(mapLazada), count: raw.length,
        truncated: raw.length >= limit,
        fieldsSeenThisPage: fieldsOf(raw),
        scope: `รายการค่าธรรมเนียมรายบรรทัด Lazada ${ymd(from)}–${ymd(end)} (≤${limit} แถว)`,
      };
    }),
    one("tiktok", async () => {
      const d = await tiktok("/finance/202309/statements", {
        method: "GET",
        query: {
          /* ⚠️ ต้องเรียง **ใหม่→เก่า** ไม่งั้นได้ใบสรุปปี 2566 มาก่อน (วัดจริง 18 ก.ย. 2569:
             ไม่ส่ง sort_order ⇒ ได้ใบของ ม.ค. 2566 เป็นใบแรก ซึ่งไม่มีใครอยากดู
             และถ้าเอาไปเขียนลงฐานแบบไล่หน้าเดียว จะได้ของเก่าสุดแทนของล่าสุด) */
          page_size: String(limit), sort_field: "statement_time", sort_order: "DESC",
          ...(pageToken ? { page_token: pageToken } : {}),
        },
      });
      const raw = d?.data?.statements ?? [];
      return {
        ok: true, grain: "statement", rows: raw.map(mapTiktok), count: raw.length,
        /* TikTok ไม่รับช่วงวันในเส้นนี้ ⇒ ได้รอบล่าสุดเรียงตามเวลา · บอกให้ชัดว่าไม่ได้กรองวัน */
        truncated: Boolean(d?.data?.next_page_token) || raw.length >= limit,
        /* ⚠️ ต้องส่งโทเคนกลับไป ไม่งั้นคนเรียกเลื่อนหน้าต่อไม่ได้เลย (เลขหน้าใช้กับเจ้านี้ไม่ได้)
           ค่าว่าง ⇒ null = **ไม่มีหน้าถัดไป** (ต่างจาก "" ที่อ่านเหมือนมีโทเคนเปล่า) */
        nextPageToken: d?.data?.next_page_token || null,
        fieldsSeenThisPage: fieldsOf(raw),
        scope: `ใบสรุปรอบโอนเงิน TikTok ล่าสุด ≤${limit} รอบ — **ไม่ได้กรองตามช่วงวัน** (เส้นนี้ไม่รับช่วงวัน)`,
      };
    }),
  ]);

  return {
    checkedAt: now.toISOString(),
    days, limit, page,
    /* ช่วงวันที่ใช้จริง — ผู้เรียกต้องเห็นว่าได้ช่วงไหนมา ไม่ใช่เดาจากพารามิเตอร์ที่ส่งไป
       ⚠️ Shopee ได้ช่วงสั้นกว่าเจ้าอื่นเมื่อ days > 14 (ดู windowDays ของเจ้านั้น) */
    range: { from: ymd(from), to: ymd(end) },
    /* ธงบอกว่าค่า to= ที่ส่งมาใช้ไม่ได้ ⇒ ใช้วันนี้แทน · ไม่ได้ส่ง to= มาเลย = false (ไม่ใช่ปัญหา) */
    toIgnored,
    ...(toIgnored ? { toIgnoredValue: toRaw.slice(0, 40) } : {}),
    shopeeMaxDays: 14,
    /* ⚠️ `page` มีผลกับ Shopee/Lazada เท่านั้น — TikTok ใช้โทเคน ⇒ บอกให้ชัดบนคำตอบ
       ไม่บอก = คนเลื่อนหน้าแล้วได้ TikTok ชุดเดิมทุกหน้า โดยไม่มีอะไรฟ้อง */
    pageApplies: "shopee, lazada (TikTok ใช้ pageToken จาก nextPageToken)",
    /* ⚠️ ป้ายขอบเขตมาก่อนตัวเลข — คนอ่านต้องเห็นก่อนว่าเลขสามเจ้าคนละระดับกัน */
    note: "ยอดสามเจ้า **คนละระดับข้อมูล** (ดู grain ของแต่ละเจ้า) ⇒ ห้ามบวกรวมกัน · " +
      "ยังไม่เขียนลงฐาน — ขั้นนี้ให้ยืนยันการจับคู่คอลัมน์กับจอ Marketplace ของ ZORT ก่อน",
    results,
  };
}

/* ── รายละเอียดค่าธรรมเนียมรายเอกสาร — ของที่จะเติมคอลัมน์ 13 ช่องของ ZORT ได้จริง ─────────
   (เพิ่ม 18 ก.ย. 2569 · ต่อจากผลไล่กอง: งบการเงินระดับกองไม่มีค่าส่ง/รายได้จาก Platform)

   🎯 ZORT /Dashboard/MKPReport ตาราง "รายธุรกรรม" มี 13 คอลัมน์ รวมคอมมิชชั่น ·
      ค่าธรรมเนียมการชำระเงิน · ค่าส่ง 3 แบบ · รายได้จาก Platform
      ⇒ ของพวกนี้อยู่ใน **รายละเอียดรายเอกสาร** ไม่ใช่ในรายการกอง

   🔒 escrow ของ Shopee มี **ชื่อผู้ซื้อ** (`buyer_user_name`) และที่อยู่ ⇒ allowlist เข้ม
      คืนเฉพาะช่องเงินที่ระบุ + ชื่อช่องที่เจอ (ไม่มีค่า) เหมือนตัวอ่านกอง */

/** ค่าธรรมเนียมรายออเดอร์ของ Shopee (escrow detail) — อ่านอย่างเดียว
 *  ⚠️ ต้องมีเลขที่ออเดอร์ของ Shopee (order_sn) · ได้จาก rows ของ ?mkpfinance=1 (ช่อง orderRef) */
export async function readShopeeOrderFees(orderSn, deps = {}) {
  const sn = String(orderSn ?? "").trim().slice(0, 40);
  if (!/^[A-Za-z0-9-]{6,40}$/.test(sn)) return { ok: false, error: "order_sn ต้องเป็นตัวอักษร/ตัวเลข 6–40 ตัว" };
  const shopee = deps.shopee ?? (await import("./shopee.mjs")).shopCall;
  try {
    const d = await shopee("/api/v2/payment/get_escrow_detail", { order_sn: sn });
    const inc = d?.response?.order_income ?? null;
    if (!inc) return { ok: true, found: false, platform: "shopee", grain: "order-fees", orderRef: sn,
      note: "Shopee ไม่ส่งก้อน order_income มา ⇒ ยังไม่รู้ว่าเพราะสิทธิ์หรือเพราะใบนี้ไม่มี" };
    return {
      ok: true, found: true, platform: "shopee", grain: "order-fees", orderRef: sn,
      /* ชื่อช่องของ Shopee ↔ คอลัมน์ ZORT (จับคู่จากชื่อ **ยังไม่ยืนยันด้วยค่าจริงเทียบจอ ZORT**) */
      escrowAmount: money(inc.escrow_amount),           // ยอดที่ร้านได้รับสุทธิ
      /* ⚠️ ช่องที่ "รวมสองช่องต้นทาง" ต้องบอกว่าเลขมาจากช่องไหน (ฝั่งจอทัก 18 ก.ย. 2569)
         ไม่บอก = ถ้าสองช่องมีค่าไม่เท่ากัน เราหยิบตัวแรกเงียบ ๆ และไม่มีใครรู้ว่าเลขนี้คืออะไร */
      itemsTotal: money(inc.original_price ?? inc.order_original_price),
      itemsTotalFrom: inc.original_price != null ? "original_price"
        : inc.order_original_price != null ? "order_original_price" : null,
      commission: money(inc.commission_fee),            // ⇒ "คอมมิชชั่น"
      serviceFee: money(inc.service_fee),               // ⇒ น่าจะเข้ากอง "ค่าใช้จ่ายอื่น"
      paymentFee: money(inc.buyer_transaction_fee ?? inc.credit_card_transaction_fee),
      paymentFeeFrom: inc.buyer_transaction_fee != null ? "buyer_transaction_fee"
        : inc.credit_card_transaction_fee != null ? "credit_card_transaction_fee" : null,
      sellerTransactionFee: money(inc.seller_transaction_fee),
      shippingPaidByBuyer: money(inc.buyer_paid_shipping_fee),      // ⇒ "ค่าส่งเก็บจากลูกค้า"
      shippingActual: money(inc.actual_shipping_fee),               // ⇒ "ค่าจัดส่งตามจริง"
      shippingSubsidyByShopee: money(inc.shopee_shipping_rebate),   // ⇒ "ค่าส่งออกโดย Marketplace"
      shippingDiscountSeller: money(inc.shipping_fee_discount_from_3pl ?? inc.seller_shipping_discount),
      shippingDiscountSellerFrom: inc.shipping_fee_discount_from_3pl != null ? "shipping_fee_discount_from_3pl"
        : inc.seller_shipping_discount != null ? "seller_shipping_discount" : null,
      /* 📏 **วัดสูตรกับของจริง 8 ใบ (18 ก.ย. 2569) — voucher ของ Shopee ห้ามบวกเข้ายอดสุทธิ**
         items − commission − serviceFee − sellerTransactionFee − paymentFee − shippingActual
           + shippingSubsidyByShopee + shippingPaidByBuyer  ⇒ ต่างจาก escrow ที่เขาบอก **แค่ 1 บาท** ใน 6/8 ใบ
           (อีก 2 ใบต่าง 13 และ 19 — ยังไม่รู้ว่ามาจากช่องไหน ยังมีช่องที่เราไม่ได้จับคู่อีก ~70 ช่อง)
         ถ้า **บวก** voucherByShopee เข้าไปด้วย ⇒ ต่าง 47 · 124 · 160 · 55 ⇒ **ผิดชัดเจน**
         ⇒ `voucher_from_shopee` เป็น "ข้อมูลว่าแพลตฟอร์มออกส่วนลดเท่าไร" **ไม่ใช่เงินที่เพิ่มเข้ายอดโอน**
            (ราคาสินค้าที่เห็นรวมส่วนลดนั้นไว้แล้ว)
         ⚠️ จับคู่กับคอลัมน์ "รายได้จาก Platform" ของ ZORT ได้ในความหมาย **แต่ห้ามเอาไปบวกยอด**
            — ตรงนี้คือจุดที่การเดาจะทำให้ยอดโอนพองขึ้นทุกใบแบบเนียน */
      voucherByShopee: money(inc.voucher_from_shopee),  // ⇒ ความหมายตรงกับ "รายได้จาก Platform" (ห้ามบวกยอด)
      voucherBySeller: money(inc.voucher_from_seller),  // ⇒ ส่วนลดที่ร้านออกเอง (ค่าใช้จ่าย) — คนละช่องกัน
      coinsByShopee: money(inc.shopee_coin_cash_back ?? inc.coins),
      /* 🔴 **`cost_of_goods_sold` ของ Shopee ใช้เป็นฐานต้นทุนไม่ได้ — วัดแล้ว 18 ก.ย. 2569**
         สุ่ม 50 ใบจากออเดอร์ Shopee 109 ใบใน 14 วัน: ไม่เป็น null ครบ 50 ใบ · ไม่เป็น 0 จำนวน 48 ใบ
         **แต่ "ต่างจากราคาสินค้า" = 0 ใบ** (เท่ากับ itemsTotal เป๊ะทั้ง 50 ใบ เช่น 6500/6500 · 150/150)
         ⇒ เขาเอา **ราคาขาย** มาใส่ช่องชื่อ "ต้นทุน" (ร้านไม่ได้กรอกต้นทุนไว้ในระบบ Shopee)
         ⇒ เอาไปคิดกำไรจะได้ **กำไรขั้นต้น 0 ทุกใบ** ซึ่งดูเหมือนตัวเลขจริงและไม่มีอะไรฟ้อง
         🔑 บทเรียน: "ไม่เป็น null" ไม่พอ — ต้องถามว่า **ค่ามันต่างจากช่องอื่นที่เรามีอยู่แล้วไหม**
            ช่องที่ลอกค่าจากช่องอื่นมา = ช่องเปล่าที่ปลอมตัวเป็นข้อมูล
         ⇒ เก็บไว้เฉย ๆ เพื่อให้เห็นว่าเคยตรวจแล้ว **ห้ามเอาไปคิดกำไร** จนกว่าจะเจอใบที่ค่าต่างจริง */
      cogs: money(inc.cost_of_goods_sold),
      cogsOriginal: money(inc.original_cost_of_goods_sold),
      /* ภาษีหัก ณ ที่จ่ายที่ Shopee หักไว้ — ต้องใช้ตอนต่อสะพาน PEAK (ยังไม่ได้เอาไปใช้ที่ไหน) */
      withholdingTax: money(inc.withholding_tax),
      fieldsSeenThisPage: Object.keys(inc).sort(),
      /* 🔒 ที่ไม่เอา: buyer_user_name · buyer_payment_method · ที่อยู่ · เบอร์ (มีในก้อนอื่นของ escrow) */
    };
  } catch (e) {
    const msg = cleanErr(e);
    if (/ยังไม่ได้เชื่อมร้าน/.test(msg)) return { skip: msg };
    return { ok: false, error: msg };
  }
}

/** บรรทัดในใบสรุปรอบโอนเงินของ TikTok — อ่านอย่างเดียว
 *  ⚠️ id ได้จาก rows ของ ?mkpfinance=1 (ช่อง id ของเจ้า tiktok) */
export async function readTiktokStatementLines(statementId, opts = {}, deps = {}) {
  const id = String(statementId ?? "").trim().slice(0, 40);
  if (!/^[0-9A-Za-z_-]{6,40}$/.test(id)) return { ok: false, error: "id ของใบสรุปต้องเป็นตัวอักษร/ตัวเลข 6–40 ตัว" };
  const limit = Math.max(1, Math.min(50, parseInt(opts.limit ?? "10", 10) || 10));
  const tiktok = deps.tiktok ?? (await import("./tiktok.mjs")).shopCall;
  try {
    /* ⚠️ เส้นนี้ **บังคับ sort_field** — ไม่ส่งไปจะได้ `36009004: SortField is a required field`
       (วัดจริง 18 ก.ย. 2569 · เอกสารไม่ได้บอกว่าบังคับ) */
    const d = await tiktok(`/finance/202309/statements/${encodeURIComponent(id)}/statement_transactions`, {
      method: "GET", query: { page_size: String(limit), sort_field: "order_create_time", sort_order: "DESC" },
    });
    const raw = d?.data?.statement_transactions ?? [];
    return {
      ok: true, platform: "tiktok", grain: "statement-line", statementId: id, count: raw.length,
      truncated: Boolean(d?.data?.next_page_token) || raw.length >= limit,
      /* 📏 ยิงจริง 18 ก.ย. 2569: เส้นนี้ให้ช่องละเอียด **57 ช่อง** ⇒ เติมคอลัมน์ของ ZORT ได้ครบกว่าใบสรุป
         ⚠️ **จับคู่จากชื่อช่องเท่านั้น ยังไม่ได้ยืนยันด้วยค่าจริงเทียบจอ ZORT** (ป้ายเดียวกับฝั่ง Shopee escrow)
            ที่ยืนยันกับค่าจริงแล้วคือฝั่ง Shopee (voucher 46 บาท) ⇒ **ห้ามอ่านว่าทั้งสองเจ้ายืนยันแล้ว**
         ช่องที่ยังไม่แน่ใจความหมายไม่จับคู่ (ดู fieldsSeenThisPage) */
      rows: raw.map((x) => ({
        id: x?.id != null ? String(x.id) : null,
        orderRef: x?.order_id != null ? String(x.order_id) : null,
        type: x?.type ?? null,
        /* ⚠️ `day` เคยรวมสองความหมาย (วันที่สั่งซื้อ / วันที่ออกใบสรุป) ⇒ จัดกลุ่มรายวันจะปนกอง
           ⇒ แยกช่องให้ชัด และบอกว่า `day` มาจากช่องไหนในแถวนั้น (ฝั่งจอทัก 18 ก.ย. 2569) */
        day: thaiDay(x?.order_create_time ?? x?.statement_time),
        dayFrom: x?.order_create_time ? "order_create_time" : x?.statement_time ? "statement_time" : null,
        orderDay: thaiDay(x?.order_create_time),
        statementDay: thaiDay(x?.statement_time),
        settlement: money(x?.settlement_amount),
        revenue: money(x?.revenue_amount),
        fee: money(x?.fee_amount),
        adjustment: money(x?.adjustment_amount),
        currency: x?.currency ?? null,
        /* ⇒ คอลัมน์ของ ZORT */
        commission: money(x?.platform_commission_amount),          // คอมมิชชั่น
        transactionFee: money(x?.transaction_fee_amount),          // ค่าธรรมเนียมการชำระเงิน
        referralFee: money(x?.referral_fee_amount),
        affiliateCommission: money(x?.affiliate_commission_amount),
        platformDiscount: money(x?.platform_discount_amount),      // **รายได้จาก Platform** (แพลตฟอร์มออกส่วนลด)
        sellerDiscount: money(x?.seller_discount_amount),          // ส่วนลดที่ร้านออกเอง (คนละช่อง ห้ามปน)
        shippingPaidByCustomer: money(x?.customer_paid_shipping_fee_amount), // ค่าส่งเก็บจากลูกค้า
        shippingActual: money(x?.actual_shipping_fee_amount),      // ค่าจัดส่งตามจริง
        shippingSubsidy: money(x?.shipping_fee_subsidy_amount),    // ค่าส่งออกโดย Marketplace
        shippingCost: money(x?.shipping_cost_amount),
        grossSales: money(x?.gross_sales_amount),
        netSales: money(x?.net_sales_amount),
        /* 🔒 ไม่เอา: ช่องที่อาจมีชื่อ/ข้อความอิสระ · ภาษี (pit/iva/sales_tax) ยังไม่ได้ตรวจว่าใช้ยังไง */
      })),
      fieldsSeenThisPage: fieldsOf(raw),
      /* 🔒 ไม่เอา: ช่องที่อาจมีข้อความอิสระ/ชื่อ (เช่น sku_name, customer) */
    };
  } catch (e) {
    const msg = cleanErr(e);
    if (/ยังไม่ได้เชื่อมร้าน/.test(msg)) return { skip: msg };
    return { ok: false, error: msg };
  }
}
