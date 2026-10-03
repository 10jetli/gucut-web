// อ่านรายการจาก ZORT แบบส่งตรง (ไม่เก็บลงคลังเงา) — รายได้อื่น · รายจ่ายอื่น · โอนเงิน · สินค้าหลากคุณสมบัติ
// ที่มา: gucut2 ขอเส้นให้ 5 จอ "มีผังแต่ไม่มีท่อ" (ใบ t_mu1bkrdw · 14 ก.ย. 2569)
//
// 📏 ตรวจเอกสาร V4 (developers.zortout.com/llms.txt) + ยิง GET ไม่ใส่รหัส 14 ก.ย. 2569:
//    Finance/GetIncomes 200 · Finance/GetExpenses 200 · Finance/GetMoneyTransfers 200 · Product/GetVariations 200
//    ⚠️ รอบ 6 ก.ย. หาไม่เจอเพราะเส้นอยู่ใต้โมดูล Finance ไม่ใช่ Payment/Transfer
//    ⚠️ เซลเพจ: ไม่พบ (221 คู่ชื่อ 404) — ไม่มีในไฟล์นี้
// ⚠️ อ่านอย่างเดียว — AddIncome/AddExpense/AddMoneyTransfer (405 = เส้นเขียน) ห้ามแตะจากที่นี่
// ⚠️ รูปคำตอบ **ยึดตามเอกสาร ยังไม่เคยเห็นข้อมูลร้านจริง** ตอนเขียน ⇒ ส่งแถวดิบให้จอ ไม่แปลงชื่อฟิลด์
//    และส่ง rowKeys (ชื่อฟิลด์ของแถวแรก) ไปด้วย จอจะได้ตรวจเองว่าตรงเอกสารไหม
// 🔒 สามสถานะ: ถาม ZORT ไม่สำเร็จ/ไม่มีช่อง list = unknown (ห้ามแปลเป็น "ไม่มีรายการ") · list ว่างจริง = rows []

const BASE = "https://open-api.zortout.com/v4";

/* ขาออกไป ZORT: ชื่อเส้น + ชื่อพารามิเตอร์วันที่ของแต่ละชนิด (เอกสารใช้คนละชื่อ) */
export const ZORT_LISTS = {
  incomes: { path: "Finance/GetIncomes", after: "incomedateafter", before: "incomedatebefore", label: "รายได้อื่น" },
  expenses: { path: "Finance/GetExpenses", after: "expensedateafter", before: "expensedatebefore", label: "รายจ่ายอื่น" },
  moneytransfers: { path: "Finance/GetMoneyTransfers", after: "dateafter", before: "datebefore", label: "โอนเงิน" },
  variations: { path: "Product/GetVariations", after: null, before: null, label: "สินค้าหลากคุณสมบัติ" },
  /* ใบโอนสินค้า — เพิ่ม 14 ก.ย. 2569 สำหรับใบ t_mu1bh5cl (ส่วนต่างกระจก vs จอ ZORT ~195 ใบ)
     📏 กวาด GetTransfers แบบไม่ระบุชนิดครบ 61 หน้า = 12,003 ใบ = กระจกพอดี (written 0) 22:22
     ⇒ ส่วนต่างกับจอ ZORT (12,197 วัด 7 ก.ย.) คือใบที่รายการปกติไม่ส่งมา — ต้องวัดยอดต่อชนิด
     เอกสาร: transferType = Transfer · Initial · Adjust · Assembly · Disassembly · Reserve · count = ยอดตามตัวกรอง */
  /* คืนสินค้าให้ผู้ขาย (soon 'buy-return') — เพิ่ม 14 ก.ย. 2569 · ใบ t_mu1bh6sa
     เอกสาร V4: GetReturnPurchaseOrders · วันที่กรองด้วย returnpurchaseorderdateafter/before · คืน count + totalAmount + totalPaymentAmount
     ⚠️ คนละตัวกับ ReturnOrder (ลูกค้าคืนของให้ร้าน) — ห้ามสลับ */
  returnpurchaseorders: {
    path: "ReturnPurchaseOrder/GetReturnPurchaseOrders", after: "returnpurchaseorderdateafter", before: "returnpurchaseorderdatebefore",
    label: "คืนสินค้าให้ผู้ขาย",
  },
  transfers: {
    path: "Transfer/GetTransfers", after: "transferdateafter", before: "transferdatebefore", label: "ใบโอนสินค้า",
    typeParam: "transferType", types: ["Transfer", "Initial", "Adjust", "Assembly", "Disassembly", "Reserve"],
  },
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function creds() {
  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME) return null;
  return { storename: ZORT_STORENAME, apikey: ZORT_APIKEY, apisecret: ZORT_APISECRET };
}

/** 🔑 **ฟิลด์ที่เครื่องอ่านได้ — ต้องมีครบ "ทุกทางออก" ของ `zortReadList`**
 *
 * 🔴 **ที่มา 4 ต.ค. 2569** (ฝั่งจอวัดจับได้หลัง deploy `693e981`): ผมเติม
 *    `upstream`/`zortCode`/`zortDesc` ครบทุกทาง **แต่ `upstreamOk` มาเฉพาะตอนสำเร็จ
 *    และ `retryable` มาเฉพาะตอนล้ม** ⇒ กฎที่ผมเขียนกำกับไว้เองในคอมมิตนั้นใช้ไม่ครบ
 *
 * ⚠️ **ทำไมช่องที่หายบางกรณีคือบั๊ก ไม่ใช่เรื่องความเรียบร้อย** — ฝั่งจอไม่มีวิธีเขียนที่ถูกเลย:
 *      `if (d.upstreamOk === false)` ⇒ ตอนล้มช่องไม่มี = `undefined` ⇒ **เงียบตอนที่ควรเตือนที่สุด**
 *      `if (!d.upstreamOk)`         ⇒ ทริกกับ **ท่อรุ่นเก่า** ที่ไม่มีช่องนี้เหมือนกัน
 *    ⇒ มีช่องครบทุกทาง จอจึงแยกได้ 3 สถานะ: `=== false` พังจริง · `=== true` ปกติ ·
 *      `=== undefined` **ท่อรุ่นเก่า** (ไม่ใช่ "ไม่มีปัญหา")
 *
 * 🔑 `upstreamOk: null` = **ยังไม่ได้ถาม ZORT** (ขอผิดตั้งแต่ขาเข้า หรือยังไม่ได้ตั้งรหัส)
 *    ต่างจาก `false` = ถามแล้วและพัง — ตอบแทนปลายทางที่ไม่เคยถูกถามไม่ได้
 * ⚠️ **เพิ่มทางออกใหม่ต้องห่อด้วย `ตอบ()`** — ด่านในเทสยิงครบทุกทางออกจริง
 *    (ไม่ใช่ตรวจว่ามีการเรียก `ตอบ` ในซอร์ส) ⇒ ลืมห่อแล้วเทสแดง ไม่ใช่เงียบ
 */
const ช่องมาตรฐาน = Object.freeze({
  upstream: "zort",
  upstreamOk: null,
  retryable: false,
  zortCode: null,
  zortDesc: null,
});
const ตอบ = (r) => ({ ...ช่องมาตรฐาน, ...r });

/** ขาเข้าจากจอ: { kind, from?, to?, keyword?, page?, limit?, type? } · from/to = yyyy-MM-dd (ไม่ใช้กับ variations)
 *  type = ชนิดใบ ใช้ได้เฉพาะ kind ที่มี types (ตอนนี้ transfers) · ตัวอื่นส่ง type มา = 400 ไม่เมินเงียบ */
export async function zortReadList(input = {}) {
  const kind = String(input.kind ?? "").trim();
  const def = ZORT_LISTS[kind];
  if (!def) return ตอบ({ ok: false, error: `ไม่รู้จักชนิด "${kind}" — ใช้ได้: ${Object.keys(ZORT_LISTS).join(" · ")}` });

  const from = String(input.from ?? "").trim();
  const to = String(input.to ?? "").trim();
  for (const [name, v] of [["from", from], ["to", to]]) {
    if (v && !DATE.test(v)) return ตอบ({ ok: false, error: `${name} ต้องเป็น yyyy-MM-dd (ได้ "${v.slice(0, 20)}")` });
  }
  if ((from || to) && !def.after) return ตอบ({ ok: false, error: `${def.label} กรองวันที่ไม่ได้ (ZORT ไม่มีพารามิเตอร์นี้)` });
  if (from && to && from > to) return ตอบ({ ok: false, error: "from ต้องไม่หลัง to" });
  const type = String(input.type ?? "").trim();
  if (type && !def.types) return ตอบ({ ok: false, error: `${def.label} ไม่มีตัวกรองชนิด (type)` });
  if (type && !def.types.includes(type)) {
    return ตอบ({ ok: false, error: `ชนิด "${type.slice(0, 20)}" ไม่รู้จัก — ใช้ได้: ${def.types.join(" · ")}` });
  }

  // ⚠️ ค่าที่ขอเกินเพดาน = บีบแล้ว **บอกจอ** (limitClamped) ไม่บีบเงียบ ๆ
  const pageIn = Math.floor(Number(input.page ?? 1));
  const page = Number.isFinite(pageIn) && pageIn >= 1 ? pageIn : 1;
  const limitIn = Math.floor(Number(input.limit ?? 100));
  const limitOk = Number.isFinite(limitIn) && limitIn >= 1;
  const limit = limitOk ? Math.min(500, limitIn) : 100;
  const keyword = String(input.keyword ?? "").trim().slice(0, 100);

  const headers = creds();
  if (!headers) return ตอบ({ ok: false, skip: "ยังไม่ได้ตั้งรหัส ZORT" });

  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (keyword) qs.set("keyword", keyword);
  if (from) qs.set(def.after, from);
  if (to) qs.set(def.before, to);
  if (type) qs.set(def.typeParam, type);
  const path = `${def.path}?${qs}`;

  let res;
  try {
    res = await fetch(`${BASE}/${path}`, { headers, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    return ตอบ({
      ok: false, unknown: true, kind,
      /* 🔑 ฟิลด์ที่ **เครื่องอ่านได้** — ฝั่งจอขอไว้ 4 ต.ค. 2569 (ใบ t_mu1bkrdw)
         จอต้องแยก "ZORT พังฝั่งเขา" ออกจาก "เราขอผิด" **จากเนื้อ ไม่ใช่จากรหัสสถานะ** */
      upstream: "zort", upstreamOk: false, zortCode: null, zortDesc: null, retryable: true,
      error: `ถาม ZORT ไม่สำเร็จ: ${String(e?.message ?? e).slice(0, 120)} — ยังไม่รู้ว่ามีรายการไหม`,
    });
  }
  const body = res.ok ? await res.json().catch(() => null) : null;
  if (!body || !Array.isArray(body.list)) {
    return ตอบ({
      ok: false,
      unknown: true,
      kind,
      http: res.status,
      zortCode: body?.res?.resCode ?? body?.resCode ?? null,
      // ข้อความของ ZORT — ใช้ไล่สาเหตุ (14 ก.ย. 2569: GetMoneyTransfers ตอบ resCode 500 แต่เดิมไม่เห็นข้อความ)
      zortDesc: String(body?.res?.resDesc ?? body?.resDesc ?? "").slice(0, 160) || null,
      /* 🔑 **ต้องมีทุกครั้งแม้ค่าปกติ** (กติกาเดียวกับ `unreadable` ใน blob-keys.mjs)
         ไม่มีช่อง ≠ ไม่มีปัญหา ⇒ ถ้าซ่อนตอนปกติ จอจะแยก "ท่อรุ่นเก่าไม่ส่งมา"
         ออกจาก "ไม่มีปัญหา" ไม่ได้ · `upstream` บอกว่าใครพัง ไม่ใช่เราพัง */
      upstream: "zort",
      upstreamOk: false,
      retryable: true,
      error: `ZORT ไม่คืนรายการ${def.label} (HTTP ${res.status}) — ยังไม่รู้ว่ามีรายการไหม ห้ามแปลว่าว่าง`,
    });
  }
  const count = Number(body.count);
  return ตอบ({
    ok: true,
    kind,
    label: def.label,
    /* 🔑 มีฟิลด์ชุดเดียวกันในกรณีสำเร็จด้วย — **ไม่มีช่อง ≠ ไม่มีปัญหา**
       จอเช็ค `upstreamOk === true` ได้ตรง ๆ แทนการเดาจากการไม่มีคีย์ */
    upstream: "zort",
    upstreamOk: true,
    retryable: false,
    zortCode: null,
    zortDesc: null,
    applied: { from: from || null, to: to || null, keyword: keyword || null, page, limit, ...(def.types ? { type: type || null } : {}) },
    ...(limitOk && limitIn > 500 ? { limitClamped: true, limitRequested: limitIn } : {}),
    // จำนวนทั้งหมดตามที่ ZORT บอก — ไม่มีช่องนี้ = null (ห้ามเอาจำนวนแถวหน้านี้มาแทน)
    count: Number.isFinite(count) ? count : null,
    // ยอดเงินรวมตามตัวกรองที่ ZORT คิดให้ (มีเฉพาะบางเส้น เช่น returnpurchaseorders) — ไม่มี = null ห้ามบวกเองจากแถวหน้านี้
    totalAmount: Number.isFinite(Number(body.totalAmount)) && body.totalAmount !== null && body.totalAmount !== undefined ? Number(body.totalAmount) : null,
    totalPaymentAmount: Number.isFinite(Number(body.totalPaymentAmount)) && body.totalPaymentAmount !== null && body.totalPaymentAmount !== undefined ? Number(body.totalPaymentAmount) : null,
    rowKeys: body.list[0] ? Object.keys(body.list[0]) : [],
    rows: body.list,
  });
}
