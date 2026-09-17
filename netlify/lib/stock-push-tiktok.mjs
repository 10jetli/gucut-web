/* 🔴 ตัวยิงสต็อกจริงขึ้น TikTok Shop — ท่านประธานสั่ง "ทำให้ครบ" 17 ก.ย. 2569 (gucut2)
 * กติกาเดียวกับ stock-push-live.mjs ①–⑧ (ส่วนกลางอยู่ stock-push-common.mjs) · ไฟล์แยกต่อเจ้าตามคำสั่ง
 * เส้น: POST /product/202309/products/{product_id}/inventory/update — **ทีละสินค้า** ก้อนละไม่เกิน 20 sku
 * ✅ สิทธิ์เขียน: พิสูจน์ด้วยรหัสปลอม 21:34 (12052032 Resource Not Found) — ?stockwriteprobe=1
 * ⚠️ จำนวนที่ตัวอ่านเห็นคือผลรวมทุกคลัง ⇒ ยิงได้เฉพาะรหัสที่มีคลังเดียว (หลายคลัง = ไม่รู้จะลงคลังไหน)
 * ⚠️ shopCall โยน error เมื่อ code ≠ 0 ⇒ ทั้งก้อนถูกปฏิเสธพร้อมรหัส · ตอบ code 0 แต่มี data.errors ⇒ รายตัวที่อยู่ใน errors ถูกปฏิเสธ */
import { shopCall, ensureShop, VERSION } from "./tiktok.mjs";
import { เตรียมยิง, แบ่งก้อน, ตัวเลือกต่อคำขอ, จดประวัติ, สรุปผล, สรุปโหมดตรวจ } from "./stock-push-common.mjs";

const ที่อยู่TikTok = (loc) => {
  if (!loc?.productId || !loc?.skuId) return "ไม่รู้ product_id/sku id บน TikTok — ไม่ยิง";
  const w = Array.isArray(loc.warehouses) ? loc.warehouses : [];
  if (w.length !== 1 || !w[0]) return `รหัสนี้มี ${w.length} คลังบน TikTok — ต้องมีคลังเดียว (ไม่รู้จะลงคลังไหน) ต้องให้คนตัดสิน`;
  return { productId: String(loc.productId), skuId: String(loc.skuId), warehouseId: String(w[0]) };
};

export async function ยิงก้อนTikTok(productId, rows, call = shopCall) {
  const body = { skus: rows.map((r) => ({ id: r.skuId, inventory: [{ warehouse_id: r.warehouseId, quantity: Number(r.to) }] })) };
  let d;
  try {
    d = await call(`/product/${VERSION}/products/${productId}/inventory/update`, { method: "POST", body });
  } catch (e) {
    return rows.map((r) => ({ ...r, result: "rejected", why: String(e?.message || e).slice(0, 200) }));
  }
  if (!d || typeof d !== "object") return rows.map((r) => ({ ...r, result: "rejected", why: "TikTok ตอบอ่านไม่ออก — ไม่รู้ผล" }));
  const errs = Array.isArray(d?.data?.errors) ? d.data.errors : [];
  const bySku = new Map();
  let ทั้งก้อน = null;
  for (const e of errs) {
    const id = e?.detail?.sku_id ?? e?.detail?.id ?? null;
    const why = `${e?.code ?? ""}: ${e?.message ?? ""}`.trim().slice(0, 200);
    if (id) bySku.set(String(id), why); else ทั้งก้อน = why;
  }
  return rows.map((r) => {
    if (bySku.has(r.skuId)) return { ...r, result: "rejected", why: bySku.get(r.skuId) };
    /* ข้อผิดพลาดที่ไม่ระบุ sku ⇒ ไม่รู้ว่าตัวไหนลง ⇒ ถือว่าปฏิเสธทั้งก้อน (รอบกวาดถัดไปจะพิสูจน์ตัวที่ลงจริง) */
    if (ทั้งก้อน) return { ...r, result: "rejected", why: `ไม่รู้ผลรายตัว: ${ทั้งก้อน}` };
    return { ...r, result: "pushed" };
  });
}

export async function tiktokPushLive(body, opts = {}) {
  if (String(body?.platform ?? "") !== "tiktok") return { error: "ตัวยิงนี้รับเฉพาะ platform: tiktok" };
  const prep = await เตรียมยิง("tiktok", body, opts, ที่อยู่TikTok);
  if (prep.error) return prep;
  if (body?.dryCheck === true) return สรุปโหมดตรวจ("tiktok", prep);

  const results = [];
  if (prep.fire.length) {
    const t = await ensureShop().catch(() => null);
    if (!t?.accessToken) return { error: "ไม่มี token TikTok ที่ใช้ได้ — ไม่ได้ยิง", ...prep.ที่มาแผน };
    const byProduct = new Map();
    for (const r of prep.fire) (byProduct.get(r.productId) || byProduct.set(r.productId, []).get(r.productId)).push(r);
    for (const [pid, rows] of byProduct) {
      for (const ก้อน of แบ่งก้อน(rows, ตัวเลือกต่อคำขอ)) results.push(...(await ยิงก้อนTikTok(pid, ก้อน)));
    }
  }
  return จดประวัติ(สรุปผล("tiktok", prep, results));
}
