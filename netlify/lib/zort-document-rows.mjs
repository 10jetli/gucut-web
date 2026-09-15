// สารบัญเอกสารบัญชีจาก ZORT แบบรายแถวสำหรับจอและ Export — อ่านอย่างเดียว
// แยกจาก zortDocumentsRead() โดยตั้งใจ: ตัวเดิมกวาดครบทุกหน้าเพื่อสรุปทั้งกอง
// ส่วนตัวนี้ส่งเพียงหน้าที่ขอ และให้ ZORT กรอง documenttype ก่อนแบ่งหน้า

const BASE = "https://open-api.zortout.com/v4";

export const ZORT_DOCUMENT_TYPES = {
  1: "ใบเสร็จรับเงิน",
  2: "ใบกำกับภาษี",
  3: "ใบแจ้งหนี้",
  4: "ใบเสนอราคา",
  5: "ใบหัก ณ ที่จ่าย",
};

// 🔒 เอกสารอาจมีชื่อลูกค้า ที่อยู่ และเลขผู้เสียภาษีทั้งระดับแถวและใน detail
// ส่งได้เฉพาะสารบัญที่จอต้องใช้ ช่องใหม่ที่ ZORT เพิ่มภายหลังจึงไม่หลุดออกเอง
export const DOCUMENT_ROW_FIELDS = [
  "id",
  "documentnumber",
  "documentdate",
  "documentdateString",
  "createdatetime",
  "createdatetimeString",
  "header",
  "referenceid",
  "referencenumber",
  "referencetype",
  "linkurl",
];

function creds() {
  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME) return null;
  return { storename: ZORT_STORENAME, apikey: ZORT_APIKEY, apisecret: ZORT_APISECRET };
}

function positiveInt(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/**
 * ขาเข้าจากจอ: { page?, limit?, type? }
 * type = 1 ใบเสร็จ · 2 ใบกำกับภาษี · 3 ใบแจ้งหนี้ · 4 ใบเสนอราคา · 5 ใบหัก ณ ที่จ่าย
 * ไม่ส่ง type = ทุกชนิด · ส่งเฉพาะช่องสารบัญใน DOCUMENT_ROW_FIELDS
 * detail ส่งเพียงชื่อช่องที่พบไว้ตรวจรูปข้อมูล ห้ามส่งค่าออกไปจนกว่าจะรู้ว่าเป็นข้อมูลอะไร
 */
export async function zortDocumentRows(input = {}) {
  const page = positiveInt(input.page, 1);
  if (page === null) return { ok: false, error: "page ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป" };

  const requestedLimit = positiveInt(input.limit, 100);
  if (requestedLimit === null) return { ok: false, error: "limit ต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป" };
  const limit = Math.min(200, requestedLimit);

  const typeRaw = input.type === undefined || input.type === null ? "" : String(input.type).trim();
  let type = null;
  if (typeRaw && typeRaw !== "0" && typeRaw !== "all") {
    if (!/^[1-5]$/.test(typeRaw)) {
      return { ok: false, error: `type ต้องเป็น 1–5 หรือไม่ส่งเพื่อดูทั้งหมด (ได้ "${typeRaw.slice(0, 20)}")` };
    }
    type = Number(typeRaw);
  }

  const headers = creds();
  if (!headers) return { ok: false, skip: "ยังไม่ได้ตั้งรหัส ZORT" };

  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (type !== null) qs.set("documenttype", String(type));

  let response;
  try {
    response = await fetch(`${BASE}/Document/GetDocuments?${qs}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    return {
      ok: false,
      unknown: true,
      error: `ถาม ZORT ไม่สำเร็จ: ${String(e?.message ?? e).slice(0, 120)} — ยังไม่รู้ว่ามีเอกสารไหม`,
    };
  }

  const raw = await response.text().catch(() => "");
  let body = null;
  try { body = JSON.parse(raw); } catch { /* ไม่ใช่ JSON */ }
  const zortCode = String(body?.res?.resCode ?? body?.resCode ?? body?.rescode ?? "");
  if (!response.ok || (zortCode && zortCode !== "200") || !Array.isArray(body?.list)) {
    return {
      ok: false,
      unknown: true,
      http: response.status,
      zortCode: zortCode || null,
      zortDesc: String(body?.res?.resDesc ?? body?.resDesc ?? "").slice(0, 160) || null,
      error: `ZORT ไม่คืนรายการเอกสาร (HTTP ${response.status}) — ยังไม่รู้ว่ามีเอกสารไหม ห้ามแปลว่าว่าง`,
      ...(body ? {} : { rawHead: raw.slice(0, 300) }),
    };
  }

  const countValue = Number(body.count);
  const count = body.count !== null && body.count !== undefined && Number.isFinite(countValue)
    ? countValue
    : null;
  const sourceRows = body.list;
  const sourceKeys = new Set();
  const detailKeys = new Set();
  for (const row of sourceRows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    for (const key of Object.keys(row)) sourceKeys.add(key);
    if (row.detail && typeof row.detail === "object" && !Array.isArray(row.detail)) {
      for (const key of Object.keys(row.detail)) detailKeys.add(key);
    }
  }
  const rows = sourceRows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return {};
    return Object.fromEntries(
      DOCUMENT_ROW_FIELDS.filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]])
    );
  });
  return {
    ok: true,
    applied: {
      page,
      limit,
      type,
      typeLabel: type === null ? "ทั้งหมด" : ZORT_DOCUMENT_TYPES[type],
    },
    ...(requestedLimit > 200 ? { limitClamped: true, limitRequested: requestedLimit } : {}),
    count,
    totalPages: count === null ? null : Math.ceil(count / limit),
    hasMore: count === null ? null : page * limit < count,
    // ชื่อช่องเท่านั้น ใช้ดูว่า ZORT เปลี่ยนรูปหรือเพิ่มช่อง โดยไม่เปิดค่าของช่องนั้น
    rowKeys: [...sourceKeys].sort(),
    detailKeys: [...detailKeys].sort(),
    rows,
  };
}
