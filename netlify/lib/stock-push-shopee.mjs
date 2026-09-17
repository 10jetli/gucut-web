/* 🔴 ตัวยิงสต็อกจริงขึ้น Shopee — ท่านประธานสั่ง "ทำให้ครบ" 17 ก.ย. 2569 (gucut2)
 * กติกาเดียวกับ stock-push-live.mjs ①–⑧ (ส่วนกลางอยู่ stock-push-common.mjs) · ไฟล์แยกต่อเจ้าตามคำสั่ง
 * เส้น: POST /api/v2/product/update_stock — **ทีละสินค้า (item_id)** ก้อนละไม่เกิน 20 ตัวเลือก
 * ✅ สิทธิ์เขียน: พิสูจน์ด้วยรหัสปลอม 21:34 (product.error_item_not_found) — ?stockwriteprobe=1
 * ⚠️ shopCall ของ shopee.mjs ยิงได้แค่ GET ⇒ ประกอบ POST เองจาก shopUrl (ลายเซ็นร้านของ Shopee ไม่รวม body)
 * ⚠️ Shopee ตอบ HTTP 200 เสมอ ⇒ ความผิดพลาดอยู่ที่ช่อง error / failure_list ไม่ใช่ status */
import { validToken, shopUrl } from "./shopee.mjs";
import { เตรียมยิง, แบ่งก้อน, ตัวเลือกต่อคำขอ, จดประวัติ, สรุปผล, สรุปโหมดตรวจ } from "./stock-push-common.mjs";

const ที่อยู่Shopee = (loc) => {
  if (loc?.itemId == null) return "ไม่รู้ item_id บน Shopee — ไม่ยิง";
  if (loc?.modelId == null) return "สินค้ามีตัวเลือกแต่อ่าน model_id ไม่ได้ — ไม่ยิง";
  return { itemId: loc.itemId, modelId: loc.modelId };
};

/** ยิงก้อนเดียว (สินค้าเดียว) — ก้อนพังไม่ลากก้อนอื่น · แปลผลรายตัวจาก success_list / failure_list */
export async function ยิงก้อนShopee(t, itemId, rows, fetchImpl = fetch) {
  const body = { item_id: Number(itemId), stock_list: rows.map((r) => ({ model_id: Number(r.modelId), seller_stock: [{ stock: Number(r.to) }] })) };
  let data;
  try {
    const res = await fetchImpl(shopUrl("/api/v2/product/update_stock", t.accessToken, t.shopId), {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    data = await res.json().catch(() => null);
  } catch (e) {
    return rows.map((r) => ({ ...r, result: "rejected", why: `ส่งไม่ถึง Shopee: ${String(e?.message || e).slice(0, 120)} — ไม่รู้ว่าลงหรือไม่ รอบกวาดถัดไปจะพิสูจน์` }));
  }
  if (!data) return rows.map((r) => ({ ...r, result: "rejected", why: "Shopee ตอบอ่านไม่ออก — ไม่รู้ว่าลงหรือไม่" }));
  if (data.error) return rows.map((r) => ({ ...r, result: "rejected", why: `${data.error}: ${data.message || ""}`.trim().slice(0, 200) }));
  const ok = new Set((data.response?.success_list || []).map((x) => String(x.model_id)));
  const bad = new Map((data.response?.failure_list || []).map((x) => [String(x.model_id), x.failed_reason || "failed"]));
  return rows.map((r) => {
    const k = String(r.modelId);
    if (bad.has(k)) return { ...r, result: "rejected", why: String(bad.get(k)).slice(0, 200) };
    if (ok.has(k)) return { ...r, result: "pushed" };
    /* 🔑 ไม่อยู่ทั้งสองรายการ ⇒ ไม่นับว่าสำเร็จ (ตอบ 200 ไม่ได้แปลว่าทำให้) */
    return { ...r, result: "rejected", why: "ไม่อยู่ใน success_list/failure_list — ไม่รู้ผล" };
  });
}

export async function shopeePushLive(body, opts = {}) {
  if (String(body?.platform ?? "") !== "shopee") return { error: "ตัวยิงนี้รับเฉพาะ platform: shopee" };
  const prep = await เตรียมยิง("shopee", body, opts, ที่อยู่Shopee);
  if (prep.error) return prep;
  if (body?.dryCheck === true) return สรุปโหมดตรวจ("shopee", prep);

  const results = [];
  if (prep.fire.length) {
    const t = await validToken().catch(() => null);
    if (!t?.accessToken) return { error: "ไม่มี token Shopee ที่ใช้ได้ — ไม่ได้ยิง", ...prep.ที่มาแผน };
    const byItem = new Map();
    for (const r of prep.fire) (byItem.get(String(r.itemId)) || byItem.set(String(r.itemId), []).get(String(r.itemId))).push(r);
    for (const [itemId, rows] of byItem) {
      for (const ก้อน of แบ่งก้อน(rows, ตัวเลือกต่อคำขอ)) results.push(...(await ยิงก้อนShopee(t, itemId, ก้อน)));
    }
  }
  return จดประวัติ(สรุปผล("shopee", prep, results));
}
