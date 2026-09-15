/* 📎 อ่านไฟล์แนบรายเอกสารจาก ZORT — **อ่านอย่างเดียว** · งานกระดาน t_mu1xao7r (15 ก.ย. 2569)

   🔴 ที่มา: คำกล่าวอ้าง 3 ก.ย. "ZORT ไม่มี API ไฟล์แนบ (File · Attachment ตอบ 404)" **ผิดตระกูลชื่อ**
      กวาดซ้ำ 15 ก.ย. 07:15 (ยิงเปล่าไม่ใส่คีย์ · ตัวควบคุมผ่านก่อน/หลัง):
        200 ⇒ Order · PurchaseOrder · Quotation · ReturnOrder · ReturnPurchaseOrder × (Get<X>Files · Get<X>FileDetail)
        404 ⇒ File/GetFiles · Attachment/GetAttachments · Transfer/GetTransferFiles · Transfer/GetTransferFileDetail
      ⚠️ ReturnOrder/ReturnPurchaseOrder **ไม่อยู่ในเอกสาร V4** แต่ยิงแล้วมีจริง

   ⚠️ **"เส้นมีอยู่" ≠ "ได้ตัวไฟล์"** — Document/GetDocuments เคยมี linkurl ครบทุกใบ แต่โหลดได้หน้า HTML
      ⇒ ตัวนี้ **ดูชนิดจากไบต์จริง** (kind) ไม่เชื่อ fileName/type ที่ ZORT บอก
   🔒 **ไม่ส่งตัวไฟล์ออก** — สลิปโอนเงินมีชื่อ/เลขบัญชีลูกค้า · ส่งแค่ขนาด + ชนิด + ชื่อช่องที่ได้จริง
   ⚠️ ดึงได้ **รายเอกสาร** เท่านั้น ไม่มีเส้นรายการไฟล์ทั้งร้าน ⇒ ห้ามวนทั้งร้านจากเส้นนี้ก่อนพิสูจน์รายใบ */

const BASE = "https://open-api.zortout.com/v4";

/** ชนิดเอกสาร ⇒ ชื่อโมดูลของ ZORT (ชื่อเส้น = <โมดูล>/Get<โมดูล>Files · Get<โมดูล>FileDetail) */
export const FILE_DOCS = {
  order: "Order",
  purchaseorder: "PurchaseOrder",
  quotation: "Quotation",
  returnorder: "ReturnOrder",
  returnpurchaseorder: "ReturnPurchaseOrder",
};

function creds() {
  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME || !ZORT_APIKEY || !ZORT_APISECRET) return null;
  return { storename: ZORT_STORENAME, apikey: ZORT_APIKEY, apisecret: ZORT_APISECRET };
}

const ENVELOPE = new Set(["res", "resCode", "resDesc"]);
const txt = (v, n = 200) => String(v ?? "").trim().slice(0, n);
const given = (v) => v !== undefined && v !== null && String(v).trim() !== "";
const posInt = (v) => {
  const s = String(v ?? "").trim();
  return /^\d{1,12}$/.test(s) && Number(s) > 0 ? Number(s) : null;
};

/** ชนิดไฟล์จากไบต์จริง — html คือสัญญาณว่าได้หน้าเว็บแทนไฟล์ (บทเรียน Document linkurl) */
export function sniffBytes(buf) {
  if (!buf || !buf.length) return "empty";
  if (buf.length >= 4 && buf.toString("latin1", 0, 4) === "%PDF") return "pdf";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG") return "png";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (buf.length >= 6 && buf.toString("latin1", 0, 3) === "GIF") return "gif";
  const head = buf.toString("utf8", 0, Math.min(buf.length, 200)).trimStart().toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return "html";
  return "unknown";
}

/**
 * @param {{doc?: string, docid?: string|number, docno?: string, fileid?: string|number}} o
 * ⇒ ไม่มี fileid: รายการไฟล์ของเอกสาร · มี fileid: รายละเอียดไฟล์หนึ่งไฟล์ (ไม่มีตัวไฟล์)
 */
export async function zortDocFiles(o = {}) {
  const doc = txt(o.doc, 40).toLowerCase();
  const mod = FILE_DOCS[doc];
  if (!mod) return { ok: false, error: `ไม่รู้จักชนิดเอกสาร "${doc}"`, accepts: Object.keys(FILE_DOCS) };

  const docid = posInt(o.docid);
  if (given(o.docid) && !docid) return { ok: false, error: "docid ต้องเป็น id ตัวเลขของ ZORT" };
  const docno = docid ? "" : txt(o.docno, 60);
  if (!docid && !docno) return { ok: false, error: "ต้องมี docid (id ของ ZORT) หรือ docno (เลขที่เอกสาร) อย่างใดอย่างหนึ่ง" };
  const fileid = posInt(o.fileid);
  if (given(o.fileid) && !fileid) return { ok: false, error: "fileid ต้องเป็นตัวเลข" };

  const endpoint = fileid ? `${mod}/Get${mod}FileDetail` : `${mod}/Get${mod}Files`;
  const applied = { doc, docid, docno: docid ? null : docno, fileid, endpoint };
  const headers = creds();
  if (!headers) return { ok: false, skip: "ยังไม่ได้ตั้งรหัส ZORT ที่ Netlify", applied };

  const qs = new URLSearchParams(docid ? { id: String(docid) } : { number: docno });
  if (fileid) qs.set("fileid", String(fileid));
  let r;
  try {
    r = await fetch(`${BASE}/${endpoint}?${qs}`, { headers, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    return { ok: false, unknown: true, applied,
      error: `ถาม ZORT ไม่สำเร็จ: ${String(e?.message ?? e).slice(0, 120)} — ยังไม่รู้ว่ามีไฟล์ไหม` };
  }
  const raw = await r.text().catch(() => "");
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, unknown: true, applied, http: r.status,
      error: "ZORT ตอบไม่ใช่ JSON — ยังไม่รู้ว่ามีไฟล์ไหม", head: raw.slice(0, 80) };
  }
  const zortCode = body?.res?.resCode ?? body?.resCode ?? null;
  const zortDesc = body?.res?.resDesc ?? body?.resDesc ?? null;
  const topKeys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : [];
  /* ZORT ตอบรหัสผลที่ไม่ใช่ 200 = **ZORT ตอบแล้วว่าไม่ได้** (เช่น Access Denied / ไม่พบเอกสาร)
     ⇒ ไม่ใช่ unknown · ส่งข้อความของ ZORT ออกไปตรง ๆ ไม่ตีความเอง */
  if (zortCode !== null && String(zortCode) !== "200") {
    return { ok: false, applied, http: r.status, zortCode: String(zortCode), zortDesc, topKeys };
  }

  if (!fileid) {
    /* เอกสารบอกแค่ "FileContent (Array)" ไม่บอกชื่อช่องหัว ⇒ หาอาร์เรย์จากที่ที่เป็นไปได้
       ⚠️ หาไม่เจอ = **รูปคำตอบไม่รู้จัก** ห้ามคืน count: 0 (ไม่งั้นกลายเป็น "ใบนี้ไม่มีไฟล์" ทั้งที่อ่านไม่ออก) */
    const arr = [body, body?.list, body?.detail, body?.files, body?.FileContent].find(Array.isArray);
    if (!arr) {
      return { ok: false, unknown: true, applied, http: r.status, zortCode, topKeys,
        error: "ไม่เจอรายการไฟล์ในคำตอบ — รูปคำตอบไม่รู้จัก (ไม่ได้แปลว่าไม่มีไฟล์)" };
    }
    return {
      ok: true, applied, http: r.status, zortCode, topKeys,
      count: arr.length,
      rowKeys: [...new Set(arr.flatMap((f) => (f && typeof f === "object" ? Object.keys(f) : [])))],
      files: arr.map((f) => ({ id: f?.id ?? null, fileName: txt(f?.fileName, 200), type: txt(f?.type, 80) })),
    };
  }

  const f = [body?.detail, body].find((x) => x && typeof x === "object" && !Array.isArray(x) && ("content" in x || "fileName" in x));
  if (!f) {
    return { ok: false, unknown: true, applied, http: r.status, zortCode, topKeys,
      error: "ไม่เจอรายละเอียดไฟล์ในคำตอบ — รูปคำตอบไม่รู้จัก" };
  }
  const content = typeof f.content === "string" ? f.content : null;
  let bytes = null;
  let kind = null;
  if (content) {
    const buf = Buffer.from(content.replace(/^data:[^,]*,/, ""), "base64");
    bytes = buf.length;
    kind = sniffBytes(buf);
  }
  return {
    ok: true, applied, http: r.status, zortCode, topKeys,
    // ⚠️ ตัดซองของ ZORT (res/resCode/resDesc) ออก — เมื่อ ZORT วางรายละเอียดไว้ชั้นบนสุดคู่กับซอง ชื่อช่องที่ส่งให้คนอ่านต้องเป็นของไฟล์เท่านั้น
    fileKeys: Object.keys(f).filter((k) => !ENVELOPE.has(k)),
    file: {
      id: f.id ?? null,
      fileName: txt(f.fileName, 200),
      type: txt(f.type, 80),
      hasContent: !!content,
      base64Chars: content ? content.length : 0,
      bytes,
      kind, // ชนิดจากไบต์จริง — "html" = ได้หน้าเว็บ ไม่ใช่ไฟล์
    },
  };
}

/**
 * ไบต์ของไฟล์แนบหนึ่งไฟล์ — **ใช้ภายในท่อเท่านั้น** (ตัวเก็บสลิป slip-archive.mjs · งานกระดาน t_mu1y49yb)
 * 🔒 ห้ามเอาไปต่อเส้นที่ส่งผลออกนอกท่อ — สลิปมีชื่อ/เลขบัญชีลูกค้า (เส้นให้จอใช้ zortDocFiles ซึ่งไม่คืนตัวไฟล์)
 * ⚠️ ไม่มี content = noContent (ไม่ใช่ไฟล์ว่างที่เก็บได้) · ชนิดดูจากไบต์จริงเสมอ (ZORT บอก PNG แต่ไบต์เป็น JPEG ได้)
 * @param {{doc?: string, docid?: string|number, docno?: string, fileid?: string|number}} o
 */
export async function zortDocFileBytes(o = {}) {
  const mod = FILE_DOCS[txt(o.doc, 40).toLowerCase()];
  const docid = posInt(o.docid);
  const docno = docid ? "" : txt(o.docno, 60);
  const fileid = posInt(o.fileid);
  if (!mod || (!docid && !docno) || !fileid) return { ok: false, error: "ต้องมี doc · docid หรือ docno · fileid" };
  const headers = creds();
  if (!headers) return { ok: false, skip: "ยังไม่ได้ตั้งรหัส ZORT ที่ Netlify" };
  const qs = new URLSearchParams(docid ? { id: String(docid) } : { number: docno });
  qs.set("fileid", String(fileid));
  let r;
  try {
    r = await fetch(`${BASE}/${mod}/Get${mod}FileDetail?${qs}`, { headers, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    return { ok: false, unknown: true, error: `ถาม ZORT ไม่สำเร็จ: ${String(e?.message ?? e).slice(0, 120)}` };
  }
  let body;
  try {
    body = JSON.parse(await r.text());
  } catch {
    return { ok: false, unknown: true, http: r.status, error: "ZORT ตอบไม่ใช่ JSON" };
  }
  const code = body?.res?.resCode ?? body?.resCode ?? null;
  if (code !== null && String(code) !== "200") {
    return { ok: false, zortCode: String(code), zortDesc: body?.res?.resDesc ?? body?.resDesc ?? null };
  }
  const f = [body?.detail, body].find((x) => x && typeof x === "object" && !Array.isArray(x) && ("content" in x || "fileName" in x));
  if (!f) return { ok: false, unknown: true, error: "ไม่เจอรายละเอียดไฟล์ในคำตอบ — รูปคำตอบไม่รู้จัก" };
  if (typeof f.content !== "string" || !f.content) {
    return { ok: false, noContent: true, fileName: txt(f.fileName, 200), error: "ZORT ไม่ส่งตัวไฟล์มา" };
  }
  const buf = Buffer.from(f.content.replace(/^data:[^,]*,/, ""), "base64");
  return { ok: true, buf, bytes: buf.length, kind: sniffBytes(buf), fileName: txt(f.fileName, 200),
    type: txt(f.type, 80), uploadType: f.uploadType ?? null, fileId: f.id ?? fileid };
}
