/* 🗂 เฝ้า listArchivedFiles — จอไฟล์แบบ ZORT /FileUpload/list (17 ต.ค. 2569)

   🔑 ข้อที่แพงที่สุดคือ **ช่องที่ตอบคนละคำถาม**: `archivedAt` (วันที่เราดึงเก็บ) ห้ามไหลไปเป็น
      `uploadedAt` (วันที่ลูกค้าอัป — ZORT ไม่มีช่องนี้เลย) ⇒ มีข้อเฝ้าตรง ๆ
   ⚠️ ตัวปลอมต้องมี **มิติที่ทำให้ข้อเฝ้าแยกแยะได้** ไม่ใช่แค่มีข้อมูล:
      ① ลำดับ archivedAt **สวนทาง** ลำดับเลขที่ใบ ⇒ ถ้าใครเปลี่ยนไปเรียงด้วย archivedAt เทสจะแดง
      ② มีคีย์ที่ getMetadata โยน error ⇒ วัดว่าแถวยังอยู่และถูกนับ
      ③ มี SO-1 กับ SO-10 ⇒ จับการแกะคีย์ที่เผลอเอาชื่อใบคาบเกี่ยวกัน
      ④ นับจำนวนครั้งที่เรียก getMetadata ⇒ พิสูจน์ว่าอ่านเฉพาะหน้าที่โชว์ (กันชนเพดาน 26 วิ) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { listArchivedFiles } from "../../netlify/lib/slip-archive.mjs";

/** ① archivedAt สวนทางเลขที่ใบโดยตั้งใจ: ใบเก่าสุด (SO-1) ถูกดึงเก็บล่าสุด */
const ของในถัง = [
  { key: "f/SO-1/11", meta: { fileName: "เก่าสุดแต่เพิ่งดึง.jpg", kind: "jpeg", bytes: "100", at: "2026-10-17T00:00:00.000Z" } },
  { key: "f/SO-10/22", meta: { fileName: "b.png", kind: "png", bytes: "200", at: "2026-01-01T00:00:00.000Z" } },
  { key: "f/SO-202610026/33", meta: { fileName: "ใหม่สุด.pdf", kind: "pdf", bytes: "300", at: "2026-02-01T00:00:00.000Z" } },
  { key: "f/SO-9/44", meta: null, โยน: true }, // ② อ่าน metadata ไม่ได้
];

function ถังปลอม(ของ = ของในถัง, { listโยน = false } = {}) {
  const นับ = { getMetadata: 0, list: 0 };
  return {
    นับ,
    store: {
      async list() {
        นับ.list += 1;
        if (listโยน) throw new Error("ที่เก็บล่ม");
        return { blobs: ของ.map((x) => ({ key: x.key })) };
      },
      async getMetadata(key) {
        นับ.getMetadata += 1;
        const row = ของ.find((x) => x.key === key);
        if (row?.โยน) throw new Error("อ่าน metadata ไม่ได้");
        return row?.meta ? { metadata: row.meta } : { metadata: null };
      },
    },
  };
}

test("เรียงใหม่→เก่าด้วย **เลขที่ใบ** ไม่ใช่ archivedAt", async () => {
  const f = ถังปลอม();
  const r = await listArchivedFiles({ store: f.store });
  assert.equal(r.ok, true);
  assert.deepEqual(r.files.map((x) => x.docno), ["SO-9", "SO-202610026", "SO-10", "SO-1"]);
  /* ถ้าเรียงด้วย archivedAt ใบแรกจะเป็น SO-1 (ดึงเก็บล่าสุด) — ข้อนี้แยกสองกติกาออกจากกัน */
  assert.notEqual(r.files[0].docno, "SO-1");
});

test("🔴 archivedAt ห้ามไหลไปเป็น uploadedAt/uploadedBy — ZORT ไม่มีสองช่องนี้", async () => {
  const f = ถังปลอม();
  const r = await listArchivedFiles({ store: f.store });
  const row = r.files.find((x) => x.docno === "SO-1");
  assert.equal(row.archivedAt, "2026-10-17T00:00:00.000Z"); // ค่าจริงต้องมา
  assert.equal(row.uploadedAt, null);  // แต่ห้ามถูกสวมรอย
  assert.equal(row.uploadedBy, null);
  assert.match(r.fieldScope, /ห้ามโชว์ใต้หัว/);
});

test("แกะคีย์ถูกตัว — SO-1 ไม่ลาก SO-10 มาด้วย", async () => {
  const f = ถังปลอม();
  const r = await listArchivedFiles({ store: f.store, q: "so-1" });
  /* q เป็นการค้นแบบมีคำนั้นอยู่ ⇒ "so-1" ตรง SO-1 · SO-10 แต่ **ไม่ตรง** SO-202610026 (ในนั้นเป็น "so-2")
     ข้อนี้เฝ้า **การแกะ docno จากคีย์** ว่าได้ชื่อใบเต็มใบ ไม่ใช่ท่อนที่ถูกตัด
     📏 ความคาดหมายรอบแรกของผมเองผิด (ใส่ SO-202610026 เข้าไปด้วย) — เทสจับได้ ไม่ใช่โค้ดผิด */
  assert.deepEqual(r.files.map((x) => x.docno).sort(), ["SO-1", "SO-10"]);
  assert.equal(r.files.find((x) => x.docno === "SO-1").fileid, "11");
  assert.equal(r.files.find((x) => x.docno === "SO-10").fileid, "22");
});

test("metadata อ่านไม่ได้ ⇒ แถวยังอยู่ + ติดธง + ถูกนับ (ห้ามทิ้งเงียบ)", async () => {
  const f = ถังปลอม();
  const r = await listArchivedFiles({ store: f.store });
  const row = r.files.find((x) => x.docno === "SO-9");
  assert.equal(row.metaUnreadable, true);
  assert.equal(row.filename, null);
  assert.equal(r.metaFailed, 1);
  assert.equal(r.files.length, r.total); // จำนวนแถวต้องเท่ากับ total ไม่ใช่หายไปหนึ่ง
});

test("④ อ่าน metadata เฉพาะหน้าที่โชว์ — ไม่ใช่ทั้งถัง (กันชนเพดาน 26 วิ)", async () => {
  const f = ถังปลอม();
  const r = await listArchivedFiles({ store: f.store, limit: 2 });
  assert.equal(r.files.length, 2);
  assert.equal(f.นับ.getMetadata, 2, "อ่าน metadata เกินจำนวนแถวที่โชว์");
  assert.equal(r.total, 4);
  assert.equal(r.nextOffset, 2);
});

test("หน้าสุดท้าย ⇒ nextOffset = null", async () => {
  const f = ถังปลอม();
  const r = await listArchivedFiles({ store: f.store, limit: 2, offset: 2 });
  assert.equal(r.files.length, 2);
  assert.equal(r.nextOffset, null);
});

test("q ค้นเลขที่ใบ และประกาศว่าค้นชื่อไฟล์ไม่ได้", async () => {
  const f = ถังปลอม();
  const r = await listArchivedFiles({ store: f.store, q: "SO-202610026" });
  assert.equal(r.total, 1);
  assert.equal(r.totalAll, 4); // ของทั้งถังยังบอกไว้ ⇒ จอแยก "กรองแล้ว" ออกจาก "ทั้งชุด" ได้
  assert.equal(r.applied.q, "so-202610026");
  assert.match(r.qScope, /ห้ามเขียนว่าค้นชื่อไฟล์ได้/);
  /* ชื่อไฟล์ที่มีคำว่า "ใหม่สุด" ค้นไม่เจอ — พิสูจน์ว่า qScope พูดความจริง */
  assert.equal((await listArchivedFiles({ store: f.store, q: "ใหม่สุด" })).total, 0);
});

test("🔴 อ่านรายการไม่ได้ ⇒ unknown:true และ **ไม่มี ok:true** (สามสถานะ ไม่ใช่สอง)", async () => {
  const f = ถังปลอม(ของในถัง, { listโยน: true });
  const r = await listArchivedFiles({ store: f.store });
  assert.equal(r.ok, false);
  assert.equal(r.unknown, true);
  assert.equal(r.files, undefined); // ห้ามส่งรายการว่างออกไปให้จอเขียนว่า "ไม่มีไฟล์"
});

test("limit เกินเพดาน ⇒ ถูกหนีบ ไม่ใช่เมินเงียบ", async () => {
  const f = ถังปลอม();
  const r = await listArchivedFiles({ store: f.store, limit: 9999 });
  assert.equal(r.limit, 200);
  assert.equal(r.applied.limit, 200);
});
