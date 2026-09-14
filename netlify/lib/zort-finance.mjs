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

/** ขาเข้าจากจอ: { kind, from?, to?, keyword?, page?, limit?, type? } · from/to = yyyy-MM-dd (ไม่ใช้กับ variations)
 *  type = ชนิดใบ ใช้ได้เฉพาะ kind ที่มี types (ตอนนี้ transfers) · ตัวอื่นส่ง type มา = 400 ไม่เมินเงียบ */
export async function zortReadList(input = {}) {
  const kind = String(input.kind ?? "").trim();
  const def = ZORT_LISTS[kind];
  if (!def) return { ok: false, error: `ไม่รู้จักชนิด "${kind}" — ใช้ได้: ${Object.keys(ZORT_LISTS).join(" · ")}` };

  const from = String(input.from ?? "").trim();
  const to = String(input.to ?? "").trim();
  for (const [name, v] of [["from", from], ["to", to]]) {
    if (v && !DATE.test(v)) return { ok: false, error: `${name} ต้องเป็น yyyy-MM-dd (ได้ "${v.slice(0, 20)}")` };
  }
  if ((from || to) && !def.after) return { ok: false, error: `${def.label} กรองวันที่ไม่ได้ (ZORT ไม่มีพารามิเตอร์นี้)` };
  if (from && to && from > to) return { ok: false, error: "from ต้องไม่หลัง to" };
  const type = String(input.type ?? "").trim();
  if (type && !def.types) return { ok: false, error: `${def.label} ไม่มีตัวกรองชนิด (type)` };
  if (type && !def.types.includes(type)) {
    return { ok: false, error: `ชนิด "${type.slice(0, 20)}" ไม่รู้จัก — ใช้ได้: ${def.types.join(" · ")}` };
  }

  // ⚠️ ค่าที่ขอเกินเพดาน = บีบแล้ว **บอกจอ** (limitClamped) ไม่บีบเงียบ ๆ
  const pageIn = Math.floor(Number(input.page ?? 1));
  const page = Number.isFinite(pageIn) && pageIn >= 1 ? pageIn : 1;
  const limitIn = Math.floor(Number(input.limit ?? 100));
  const limitOk = Number.isFinite(limitIn) && limitIn >= 1;
  const limit = limitOk ? Math.min(500, limitIn) : 100;
  const keyword = String(input.keyword ?? "").trim().slice(0, 100);

  const headers = creds();
  if (!headers) return { ok: false, skip: "ยังไม่ได้ตั้งรหัส ZORT" };

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
    return { ok: false, unknown: true, kind, error: `ถาม ZORT ไม่สำเร็จ: ${String(e?.message ?? e).slice(0, 120)} — ยังไม่รู้ว่ามีรายการไหม` };
  }
  const body = res.ok ? await res.json().catch(() => null) : null;
  if (!body || !Array.isArray(body.list)) {
    return {
      ok: false,
      unknown: true,
      kind,
      http: res.status,
      zortCode: body?.res?.resCode ?? body?.resCode ?? null,
      // ข้อความของ ZORT — ใช้ไล่สาเหตุ (14 ก.ย. 2569: GetMoneyTransfers ตอบ resCode 500 แต่เดิมไม่เห็นข้อความ)
      zortDesc: String(body?.res?.resDesc ?? body?.resDesc ?? "").slice(0, 160) || null,
      error: `ZORT ไม่คืนรายการ${def.label} (HTTP ${res.status}) — ยังไม่รู้ว่ามีรายการไหม ห้ามแปลว่าว่าง`,
    };
  }
  const count = Number(body.count);
  return {
    ok: true,
    kind,
    label: def.label,
    applied: { from: from || null, to: to || null, keyword: keyword || null, page, limit, ...(def.types ? { type: type || null } : {}) },
    ...(limitOk && limitIn > 500 ? { limitClamped: true, limitRequested: limitIn } : {}),
    // จำนวนทั้งหมดตามที่ ZORT บอก — ไม่มีช่องนี้ = null (ห้ามเอาจำนวนแถวหน้านี้มาแทน)
    count: Number.isFinite(count) ? count : null,
    rowKeys: body.list[0] ? Object.keys(body.list[0]) : [],
    rows: body.list,
  };
}
