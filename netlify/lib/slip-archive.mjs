/* 📎 เก็บสลิปจาก ZORT ลงที่เก็บปิดของเรา ก่อนวันปิดบัญชี ZORT — งานกระดาน t_mu1y49yb (ท่านประธานติ๊ก 15 ก.ย. 2569)

   ที่มา (พิสูจน์แล้ว 15 ก.ย. · ใบ t_mu1xao7r):
     · จอ /FileUpload/list ไล่ครบ 20 หน้า = **381 ไฟล์ · Slip ทั้งหมด · แนบออเดอร์ SO- ทั้งหมด · 373 ใบ**
     · `Order/GetOrderFileDetail` คืนตัวไฟล์จริง (base64) — ไม่ใช่ลิงก์ HTML แบบ Document linkurl
   ⇒ ดึงผ่าน API ได้ทั้งกอง · ตัวนี้คือ "ดึงจริง" เพื่อให้ตัดสลิปออกจากกองคัดมือได้

   🔒 **ข้อมูลอ่อนไหว** — สลิปมีชื่อ/เลขบัญชี/ยอดเงินของลูกค้า
      ① เก็บที่ Netlify Blobs ถังปิด `gucut-zort-slips` เท่านั้น — ห้ามไป R2 (ถังนั้นเปิดสาธารณะ)
      ② **แยกถังจาก gucut-zort-archive โดยตั้งใจ** — เส้นรายการของถังนั้นไล่ getMetadata ทุกคีย์
         ใส่ 381 ไฟล์เข้าไป = เส้นนั้นช้าจนชนเพดาน 26 วิ และสลิปจะไปโผล่ในรายการ "จอที่เก็บแล้ว"
      ③ ไม่มีเส้นไหนคืนตัวไฟล์ · ห้าม log เนื้อไฟล์ · ห้ามส่งเข้า Telegram
   ⚠️ **ดึงได้ ≠ ดึงแล้ว** — นับครบต้องเทียบกับจำนวนท้ายจอ ZORT (381) และจำนวนไฟล์ต่อใบจากจอ ไม่ใช่เทียบกับตัวเอง
   ⚠️ เลขที่ออเดอร์ใน ZORT ซ้ำกันได้ ⇒ ZORT เลือกใบให้เองเมื่อค้นด้วย number · ตัวตรวจภายนอกต้องเทียบจำนวนไฟล์ต่อใบกับจอ */
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { zortDocFiles, zortDocFileBytes } from "./zort-files.mjs";

export const SLIP_STORE = "gucut-zort-slips";
/* ⏱ ครั้งละไม่เกิน 8 ใบ + เลิกเริ่มใบใหม่หลัง 18 วิ — เพดานฟังก์ชัน 26 วิ ต้องเหลือเวลาเขียนผลตอบกลับ
   (ต่อใบ = รายการไฟล์ 1 ครั้ง + รายละเอียด 1 ครั้งต่อไฟล์ · ไฟล์ละ ~70KB) */
export const SLIP_BATCH_MAX = 8;
const DEADLINE_MS = 18000;
/* ชนิดที่นับว่าเป็น "ตัวไฟล์จริง" — html/empty/unknown = **ไม่เก็บ และนับว่ายังไม่ครบ** ห้ามข้ามเงียบ ๆ */
const GOOD_KINDS = new Set(["jpeg", "png", "webp", "gif", "pdf"]);

const keyOf = (docno, fileid) => `f/${encodeURIComponent(docno)}/${fileid}`;
const cleanDocno = (v) => {
  const s = String(v ?? "").trim();
  return /^[A-Za-z0-9._-]{1,60}$/.test(s) ? s : null;
};

/**
 * @param {{docnos?: string[], store?: any, deadlineMs?: number, now?: () => number}} o
 */
export async function archiveSlips(o = {}) {
  const list = Array.isArray(o.docnos) ? o.docnos : null;
  if (!list || !list.length) return { ok: false, error: "ต้องส่ง docnos เป็นอาร์เรย์เลขที่ออเดอร์" };
  if (list.length > SLIP_BATCH_MAX) return { ok: false, error: `ครั้งละไม่เกิน ${SLIP_BATCH_MAX} ใบ (ส่งมา ${list.length})` };
  const cleaned = list.map(cleanDocno);
  const badInput = list.filter((_, i) => !cleaned[i]);
  if (badInput.length) return { ok: false, error: "เลขที่ออเดอร์รูปแบบไม่ถูก", bad: badInput.slice(0, 5).map(String) };

  const store = o.store ?? getStore({ name: SLIP_STORE, consistency: "strong" });
  const now = o.now ?? Date.now;
  const started = now();
  const deadline = Number(o.deadlineMs) > 0 ? Number(o.deadlineMs) : DEADLINE_MS;
  const orders = [];
  const notStarted = [];

  /* เรียงทีละใบ ไม่ยิงพร้อมกันทั้งชุด — ZORT อาจนับว่ายิงรัวแล้วตอบผิดปกติทั้งแผง */
  for (const docno of [...new Set(cleaned)]) {
    if (now() - started > deadline) { notStarted.push(docno); continue; }
    const row = { docno, zortFiles: null, stored: 0, already: 0, bad: [], errors: [] };
    const listed = await zortDocFiles({ doc: "order", docno });
    if (!listed.ok) {
      row.errors.push({ stage: "list", unknown: !!listed.unknown, zortCode: listed.zortCode ?? null,
        error: listed.error ?? listed.zortDesc ?? listed.skip ?? "อ่านรายการไฟล์ไม่ได้" });
      orders.push(row);
      continue;
    }
    row.zortFiles = listed.count;
    for (const f of listed.files) {
      if (!f.id) { row.errors.push({ stage: "list", error: "ไฟล์ไม่มี id" }); continue; }
      const key = keyOf(docno, f.id);
      /* 🔒 อ่านของเดิมไม่สำเร็จ = **ไม่ดึงซ้ำและไม่เขียน** (read-before-write-no-swallow)
         ⚠️ เช็คก่อนยิงรายละเอียด — ไฟล์ที่เก็บแล้วห้ามดึงซ้ำ (เปลืองโควตา ZORT และเวลา) */
      let exists;
      try {
        exists = await store.getMetadata(key);
      } catch {
        row.errors.push({ stage: "check", fileid: f.id, error: "ตรวจของเดิมในที่เก็บไม่ได้ — ยังไม่ดึง" });
        continue;
      }
      if (exists) { row.already += 1; continue; }
      const got = await zortDocFileBytes({ doc: "order", docno, fileid: f.id });
      if (!got.ok) {
        row.errors.push({ stage: "detail", fileid: f.id, unknown: !!got.unknown, noContent: !!got.noContent,
          error: got.error ?? got.zortDesc ?? "ดึงไฟล์ไม่ได้" });
        continue;
      }
      if (!GOOD_KINDS.has(got.kind)) { row.bad.push({ fileid: f.id, kind: got.kind, bytes: got.bytes }); continue; }
      const sha256 = createHash("sha256").update(got.buf).digest("hex");
      try {
        await store.set(key, got.buf.buffer.slice(got.buf.byteOffset, got.buf.byteOffset + got.buf.byteLength), {
          metadata: { docno, fileid: String(f.id), fileName: got.fileName, type: got.type, kind: got.kind,
            bytes: String(got.bytes), sha256, uploadType: String(got.uploadType ?? ""), at: new Date().toISOString() },
        });
        row.stored += 1;
      } catch {
        row.errors.push({ stage: "store", fileid: f.id, error: "เขียนลงที่เก็บไม่สำเร็จ" });
      }
    }
    orders.push(row);
  }

  const sum = (k) => orders.reduce((s, r) => s + (Array.isArray(r[k]) ? r[k].length : Number(r[k] ?? 0)), 0);
  const complete = notStarted.length === 0 && orders.every((r) =>
    r.errors.length === 0 && r.bad.length === 0 && r.zortFiles !== null && r.stored + r.already === r.zortFiles);
  return {
    ok: true,
    store: SLIP_STORE,
    orders,
    notStarted, // ใบที่ยังไม่ได้เริ่มเพราะใกล้เพดานเวลา — ส่งมาใหม่รอบหน้า
    totals: { orders: orders.length, zortFiles: sum("zortFiles"), stored: sum("stored"), already: sum("already"),
      bad: sum("bad"), errors: sum("errors"), notStarted: notStarted.length },
    complete,
  };
}

/** นับของที่เก็บแล้ว — **ไม่คืนตัวไฟล์** · อ่านรายการไม่ได้ = unknown (ห้ามแปลว่ายังไม่มีไฟล์) */
export async function slipArchiveSummary(o = {}) {
  const store = o.store ?? getStore({ name: SLIP_STORE, consistency: "strong" });
  let blobs;
  try {
    ({ blobs } = await store.list({ prefix: "f/" }));
  } catch {
    return { ok: false, unknown: true, error: "อ่านรายการที่เก็บไม่ได้ — ห้ามแปลว่ายังไม่มีไฟล์" };
  }
  if (!Array.isArray(blobs)) return { ok: false, unknown: true, error: "รายการที่เก็บตอบรูปไม่รู้จัก" };
  const byOrder = {};
  for (const b of blobs) {
    const docno = decodeURIComponent(String(b.key).split("/")[1] ?? "");
    byOrder[docno] = (byOrder[docno] ?? 0) + 1;
  }
  const expectedFiles = Number(o.expectedFiles) > 0 ? Number(o.expectedFiles) : null;
  return {
    ok: true,
    store: SLIP_STORE,
    files: blobs.length,
    orders: Object.keys(byOrder).length,
    byOrder,
    expectedFiles,
    complete: expectedFiles === null ? null : blobs.length === expectedFiles,
    note: "นับเฉพาะไฟล์ที่ผ่านตรวจชนิดจากไบต์ (jpeg/png/webp/gif/pdf) · complete ต้องส่ง expected จากจำนวนท้ายจอ ZORT /FileUpload/list · ไม่ส่ง = null (ไม่รู้)",
  };
}

/* 🔍 อ่านสลิปของ "ใบเดียว" ให้จอรายละเอียดใบขาย (15 ก.ย. 2569 · ผังเดียวกับ ZORT ที่แนบสลิปไว้ในหน้าใบ)
   🔒 ขอบเขตตั้งใจแคบ: ต้องรู้เลขที่ใบก่อน · **ไม่มีเส้นรายชื่อทั้งถัง** (สรุปทั้งถังมีแค่ตัวนับ slipArchiveSummary)
      ⇒ ไล่ดูสลิปลูกค้าทั้งร้านในที่เดียวไม่ได้ · ต้องผ่าน adminGate เหมือนทุกเส้นใน core.mjs
   ⚠️ prefix ต้องปิดท้ายด้วย "/" — ไม่งั้น SO-1 ลากไฟล์ของ SO-10 · SO-11 มาด้วย (มีเทสต์เฝ้า)
   ⚠️ ของในถังคือภาพ ณ วันที่เก็บ (ช่อง at ต่อไฟล์) — ZORT รับสลิปใหม่ทุกวัน ⇒ ว่าง ≠ ใบนี้ไม่มีสลิปใน ZORT */
const SLIP_MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf" };

export async function listOrderSlips(o = {}) {
  const docno = cleanDocno(o.docno);
  if (!docno) return { ok: false, error: "เลขที่ใบไม่ถูกต้อง (A-Z a-z 0-9 . _ - ไม่เกิน 60 ตัว)" };
  const store = o.store ?? getStore({ name: SLIP_STORE, consistency: "strong" });
  const prefix = `f/${encodeURIComponent(docno)}/`;
  let blobs;
  try {
    ({ blobs } = await store.list({ prefix }));
  } catch {
    return { ok: false, unknown: true, error: "อ่านที่เก็บสลิปไม่ได้ — ห้ามแปลว่าใบนี้ไม่มีสลิป" };
  }
  if (!Array.isArray(blobs)) return { ok: false, unknown: true, error: "รายการที่เก็บตอบรูปไม่รู้จัก" };
  const files = [];
  for (const b of blobs) {
    const key = String(b?.key ?? "");
    if (!key.startsWith(prefix)) continue;
    let meta;
    try {
      meta = (await store.getMetadata(key))?.metadata ?? null;
    } catch {
      return { ok: false, unknown: true, error: "อ่านรายละเอียดไฟล์ในที่เก็บไม่ได้ — รายการอาจไม่ครบ" };
    }
    const kind = String(meta?.kind ?? "");
    files.push({
      fileid: key.slice(prefix.length),
      kind: SLIP_MIME[kind] ? kind : null,
      bytes: Number(meta?.bytes) || null,
      archivedAt: meta?.at ?? null,
    });
  }
  return {
    ok: true,
    docno,
    count: files.length,
    files,
    note: "สลิปที่เก็บไว้ ณ วันที่ในช่อง archivedAt — ZORT รับสลิปใหม่ทุกวัน ⇒ ว่างไม่ได้แปลว่าใบนี้ไม่มีสลิปใน ZORT",
  };
}

/** ตัวไฟล์ของสลิปหนึ่งไฟล์ — content-type คิดจาก kind ที่ตรวจจากไบต์ตอนเก็บ **ไม่เชื่อ type ที่ ZORT บอก** */
export async function readOrderSlip(o = {}) {
  const docno = cleanDocno(o.docno);
  if (!docno) return { ok: false, status: 400, error: "เลขที่ใบไม่ถูกต้อง" };
  const fileid = String(o.fileid ?? "").trim();
  if (!/^\d{1,20}$/.test(fileid)) return { ok: false, status: 400, error: "fileid ต้องเป็นตัวเลข" };
  const store = o.store ?? getStore({ name: SLIP_STORE, consistency: "strong" });
  const key = keyOf(docno, fileid);
  let meta, buf;
  try {
    meta = (await store.getMetadata(key))?.metadata ?? null;
    if (!meta) return { ok: false, status: 404, error: "ไม่พบสลิปนี้ในที่เก็บ (อาจยังไม่ได้เก็บ — ไม่ได้แปลว่าไม่มีใน ZORT)" };
    buf = await store.get(key, { type: "arrayBuffer" });
  } catch {
    return { ok: false, status: 502, unknown: true, error: "อ่านที่เก็บสลิปไม่ได้" };
  }
  if (!buf || !buf.byteLength) return { ok: false, status: 502, unknown: true, error: "ไฟล์ในที่เก็บว่าง" };
  const contentType = SLIP_MIME[String(meta.kind ?? "")];
  if (!contentType) return { ok: false, status: 415, error: "ชนิดไฟล์ไม่อยู่ในรายการที่เปิดให้ดู" };
  return { ok: true, buf, contentType, kind: meta.kind, fileid, archivedAt: meta.at ?? null };
}

/* 🗂 **รายการไฟล์ทั้งถัง** ให้จอไฟล์แบบ ZORT `/FileUpload/list` (17 ต.ค. 2569 · คำขอจากฝั่งจอ)
   🔴 **เส้นนี้กลับคำ "ขอบเขตตั้งใจแคบ" ที่เขียนไว้ข้างบนโดยตั้งใจ — เหตุผลที่กลับ:**
     ① จอ ZORT เองโชว์ไฟล์ทั้งร้านพร้อมชื่อไฟล์ ให้คนที่ล็อกอินร้าน ⇒ เส้นนี้**ไม่ได้ขยายการเปิดเผย
        เกินจอที่ ZORT เปิดอยู่แล้ว** และเป้าคือ "เหมือน ZORT 100%" (กฎท่านประธาน)
     ② **ยังไม่ส่งตัวไฟล์ออกเหมือนเดิม** — ไม่มี content ไม่มี url · ตัวไฟล์ยังต้องขอรายใบผ่าน
        เส้นเดิมที่ต้องรู้เลขที่ใบก่อน ⇒ ข้อห้าม "ไม่ส่งตัวไฟล์ออก" ยังอยู่ครบ
     ③ ชื่อไฟล์: วัดจริง 17 ต.ค. 2569 — สุ่ม **8 ไฟล์ คร่อม มี.ค. 2568 → ต.ค. 2569** เป็นชื่อที่
        เครื่องสร้าง (แฮช 52 ตัว · 11 ตัว · 40 ตัว) **ไม่มีอักษรไทยเลย** ⇒ ไม่พบชื่อลูกค้าปน
        ⚠️ **8 จาก 393 ไม่ใช่ทั้งชุด** — ถ้าวันหนึ่งลูกค้าอัปไฟล์ชื่อตัวเอง ชื่อนั้นจะขึ้นจอ
           จอจึงต้องถือว่าช่องนี้ "อาจมีชื่อคน" ไม่ใช่ "ไม่มีแน่"

   🔑 **สองช่องที่ ZORT ไม่มีให้เลย — ส่ง null เสมอ ห้ามเอาช่องอื่นมาสวมรอย**
     `uploadedAt` · `uploadedBy` — ยิงพิสูจน์ 17 ต.ค. 2569: แถวไฟล์ของ ZORT มี **6 ช่องเท่านั้น**
     (`id · content · fileName · type · url · uploadType`) วัดจาก **8 ใบ คร่อม 20 เดือน เหมือนกันทุกใบ**
     ⚠️ `archivedAt` = **วันที่เราดึงมาเก็บ** ไม่ใช่วันที่ลูกค้าอัป ⇒ **ตอบคนละคำถาม**
        เอาไปโชว์ใต้หัว "วันที่อัปโหลด" = จอโกหกโดยระบบไม่ล้ม

   ⚠️ **อ่าน metadata เฉพาะหน้าที่โชว์** — ไล่ทั้งถัง (393 คีย์) = 393 getMetadata ต่อคำขอ ชนเพดาน 26 วิ
      ⇒ เรียง+ตัดหน้า **จากตัวคีย์** (คีย์มี docno + fileid อยู่แล้ว) แล้วค่อยอ่าน metadata ของสไลซ์
      ⇒ ผลพลอยได้: `q` ค้นได้แค่ **เลขที่ใบ** (อยู่ในคีย์) · ค้นชื่อไฟล์ต้องอ่าน metadata ทุกคีย์ ⇒ ยังทำไม่ได้
         บอกผ่าน `qScope` **ห้ามปล่อยให้จอเขียนว่าค้นชื่อไฟล์ได้**
   ⚠️ เรียงใหม่→เก่าใช้ **เลขที่ใบ** (SO-YYYYMM### ⇒ เรียงตามตัวอักษร = เรียงตามเดือนของเอกสาร)
      ไม่ใช่เวลาอัป (ไม่มี) และไม่ใช่ `archivedAt` (เป็นวันที่เราดึง ⇒ ไฟล์เก่าที่เพิ่งดึงจะเด้งขึ้นบนสุด)
   ⚠️ metadata ของบางคีย์อ่านไม่ได้ ⇒ **ยังส่งแถวนั้นออกแต่ติดธง** `metaUnreadable` + นับใน `metaFailed`
      ทิ้งแถวเงียบ ๆ = จำนวนที่จอนับได้น้อยกว่า total โดยไม่มีอะไรฟ้อง */
export async function listArchivedFiles(o = {}) {
  const store = o.store ?? getStore({ name: SLIP_STORE, consistency: "strong" });
  const lim = Math.min(Math.max(Number(o.limit) > 0 ? Math.floor(Number(o.limit)) : 50, 1), 200);
  const off = Number(o.offset) > 0 ? Math.floor(Number(o.offset)) : 0;
  const q = String(o.q ?? "").trim().toLowerCase().slice(0, 60);

  let blobs;
  try {
    ({ blobs } = await store.list({ prefix: "f/" }));
  } catch {
    return { ok: false, unknown: true, error: "อ่านรายการที่เก็บไม่ได้ — ห้ามแปลว่าไม่มีไฟล์" };
  }
  if (!Array.isArray(blobs)) return { ok: false, unknown: true, error: "รายการที่เก็บตอบรูปไม่รู้จัก" };

  /* คีย์ = f/<docno ที่ encode แล้ว>/<fileid> ⇒ แกะได้ทั้งสองค่าโดยไม่ต้องอ่าน metadata */
  const all = [];
  for (const b of blobs) {
    const parts = String(b?.key ?? "").split("/");
    if (parts.length < 3 || parts[0] !== "f") continue;
    let docno;
    try {
      docno = decodeURIComponent(parts[1]);
    } catch {
      docno = parts[1]; // %ที่ไม่ใช่รหัส ⇒ ใช้ค่าดิบ ห้ามโยน error ทิ้งทั้งรายการ
    }
    all.push({ key: b.key, docno, fileid: parts.slice(2).join("/") });
  }
  const matched = q ? all.filter((r) => r.docno.toLowerCase().includes(q)) : all;
  matched.sort((a, b) => b.docno.localeCompare(a.docno) || b.fileid.localeCompare(a.fileid));

  const page = matched.slice(off, off + lim);
  let metaFailed = 0;
  const files = [];
  for (const r of page) {
    let meta = null;
    let unreadable = false;
    try {
      meta = (await store.getMetadata(r.key))?.metadata ?? null;
    } catch {
      unreadable = true;
      metaFailed += 1;
    }
    const kind = String(meta?.kind ?? "");
    files.push({
      fileid: r.fileid,
      docno: r.docno,
      docType: "order",
      filename: meta?.fileName ?? null,
      kind: SLIP_MIME[kind] ? kind : null,
      bytes: Number(meta?.bytes) || null,
      archivedAt: meta?.at ?? null,
      uploadedAt: null,
      uploadedBy: null,
      ...(unreadable ? { metaUnreadable: true } : {}),
    });
  }

  return {
    ok: true,
    store: SLIP_STORE,
    total: matched.length,
    totalAll: all.length,
    count: files.length,
    offset: off,
    limit: lim,
    nextOffset: off + files.length < matched.length ? off + files.length : null,
    files,
    metaFailed,
    applied: { q: q || null, limit: lim, offset: off },
    qScope: "q ค้นได้เฉพาะ **เลขที่ใบ** (ชื่อไฟล์อยู่ใน metadata ซึ่งอ่านเฉพาะหน้าที่โชว์) ⇒ จอห้ามเขียนว่าค้นชื่อไฟล์ได้",
    sortScope: "เรียงตามเลขที่ใบมาก→น้อย (SO-YYYYMM### ⇒ ตามเดือนของเอกสาร) — ไม่ใช่เวลาอัป (ZORT ไม่มี) และไม่ใช่ archivedAt",
    docTypeScope: "ตอนนี้มีแต่ใบขาย (order) — ตัวดึงใส่ doc:\"order\" ไว้ตายตัว · ใบซื้อ/ใบเสนอราคา/ใบคืน ZORT มีเส้นให้แต่ยังไม่ได้ดึงมาเก็บ",
    fieldScope: "uploadedAt/uploadedBy = null เพราะ **ZORT ไม่มีสองช่องนี้** (ยิง 17 ต.ค. 2569 · แถวไฟล์มี 6 ช่อง: id, content, fileName, type, url, uploadType · วัด 8 ใบ คร่อม 20 เดือน) — archivedAt คือวันที่เราดึงเก็บ ห้ามโชว์ใต้หัว \"วันที่อัปโหลด\"",
    nameScope: "filename มาจาก ZORT · สุ่มวัด 8 ไฟล์คร่อม 20 เดือน ไม่พบอักษรไทย/ชื่อคน แต่ **8 จาก 393 ไม่ใช่ทั้งชุด** ⇒ ถือว่าช่องนี้อาจมีชื่อคนได้",
    note: "ไม่ส่งตัวไฟล์ออก (ไม่มี content/url) — ตัวไฟล์ขอรายใบผ่าน ?slips=<เลขที่ใบ> เท่านั้น · ของในถังคือภาพ ณ วันที่ archivedAt ⇒ ว่าง ≠ ZORT ไม่มีไฟล์",
  };
}
