// สต็อกบน Shopee vs สต็อกในคลังเรา — ขั้น "เงา" ของงานดันสต็อกกลับแพลตฟอร์ม
//
// กฎที่เจ้าของร้านสั่ง: ทำให้เหมือน ZORT 100% — ZORT ดันสต็อกกลับ Shopee ให้อยู่ทุกวัน
// ถ้าจะเลิกจ่าย เราต้องดันเองได้ **และดันได้ถูกต้อง**
//
// ⚠️ ไฟล์นี้ **อ่านอย่างเดียว ไม่เขียนอะไรกลับ Shopee เลย** โดยตั้งใจ
//    ดันสต็อกผิด = ของหมดกลายเป็นมีขาย (ขายเกิน ลูกค้าโวย) หรือของมีกลายเป็นหมด (ขายไม่ได้)
//    ต้องพิสูจน์ก่อนว่าเลขที่เราจะดันตรงกับที่ ZORT ดันอยู่ทุกวัน แล้วค่อยเปิดการเขียน
//    ตัวเขียนจริงจะอยู่คนละไฟล์ และต้องมีสวิตช์ env แยก — ห้ามใส่รวมในนี้
import { coreQuery, coreReady } from "./coredb.mjs";
import { validToken, shopCall } from "./shopee.mjs";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** ยิงหลายงานพร้อมกันทีละก้อน — Netlify ให้ฟังก์ชันรอผลได้ 26 วินาที */
async function inChunks(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

/** อ่านสต็อกทุก SKU ที่ขายอยู่บน Shopee (รวมระดับตัวเลือกสินค้า) */
async function shopeeStock() {
  const ids = [];
  let offset = 0;
  for (let p = 0; p < 25; p++) {
    const d = await shopCall("/api/v2/product/get_item_list", {
      offset: String(offset),
      page_size: "100",
      item_status: "NORMAL",
    });
    for (const it of d?.response?.item ?? []) ids.push(it.item_id);
    if (!d?.response?.has_next_page) break;
    offset += 100;
  }
  if (!ids.length) return [];

  // ชื่อ + SKU ระดับสินค้า (ทีละ 50 ตามเพดาน API)
  const base = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const d = await shopCall("/api/v2/product/get_item_base_info", {
      item_id_list: ids.slice(i, i + 50).join(","),
    });
    for (const it of d?.response?.item_list ?? []) base.set(it.item_id, it);
  }

  // สต็อกจริงอยู่ระดับ "ตัวเลือก" (model) — ต้องถามรายสินค้า
  const rows = [];
  await inChunks(ids, 8, async (id) => {
    const b = base.get(id) || {};
    try {
      const d = await shopCall("/api/v2/product/get_model_list", { item_id: String(id) });
      const models = d?.response?.model ?? [];
      if (models.length) {
        for (const m of models) {
          // seller_stock = จำนวนที่ผู้ขายตั้งไว้ (ตัวที่ ZORT ดันมา) ไม่ใช่ยอดที่ถูกจองไว้
          const qty = num(m?.stock_info_v2?.seller_stock?.[0]?.stock);
          rows.push({
            sku: String(m.model_sku || "").trim(),
            name: `${b.item_name || ""} ${m.model_name || ""}`.trim().slice(0, 120),
            qty,
          });
        }
      } else {
        const s = d?.response?.tier_variation?.length ? null : b;
        rows.push({
          sku: String(b.item_sku || "").trim(),
          name: String(b.item_name || "").slice(0, 120),
          qty: num(s?.stock_info_v2?.seller_stock?.[0]?.stock),
        });
      }
    } catch {
      // สินค้าตัวเดียวอ่านไม่ได้ ไม่ควรล้มทั้งรอบ — ข้ามไปแล้วรายงานจำนวนที่ได้
    }
    return null;
  });
  return rows;
}

/** รหัสฐานของ SKU ตัวเลือก — Shopee แตกเป็นรายตัวเลือก (00369-54T) แต่ ZORT
 *  เก็บเป็นรหัสฐานตัวเดียว (00369) · ตัดท้ายทีละขีดจนกว่าจะเจอในคลังเรา */
function baseCandidates(sku) {
  const out = [];
  let s = sku;
  while (s.includes("-")) {
    s = s.slice(0, s.lastIndexOf("-"));
    if (s) out.push(s);
  }
  return out;
}

/** รายชื่อ SKU ที่ Shopee ขายอยู่แต่คลังเราไม่รู้จัก + เดารหัสฐานให้
 *
 *  ⚠️ ผลรอบแรก 2 ก.ย. 2569 บอกเรื่องใหญ่: 276 ใน 320 SKU ของ Shopee ไม่มีในคลังเรา
 *     แต่ **ไม่ใช่เพราะสต็อกไม่ถูกซิงก์** — เป็นเพราะสองระบบนับคนละระดับ
 *     ZORT: `00369` โซ่ 325 = 5,911 (รวมทุกความยาว)
 *     Shopee: `00369-25T` `00369-54T` ... แยกตามจำนวนข้อโซ่
 *     ⇒ ต่อให้เราดันสต็อกเองได้ ก็ยังตอบไม่ได้ว่าโซ่ 54 ข้อเหลือกี่เส้น
 *        เพราะ **ต้นทางไม่เคยแยกไว้** — ต้องให้ร้านตัดสินใจเรื่องนี้ก่อน ห้ามเดาแทน */
export async function shopeeMissingSkus() {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const t = await validToken();
  if (!t) return { skip: "ยังไม่ได้เชื่อมร้าน Shopee" };

  const day = (await coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`))[0]?.d;
  if (!day) return { note: "ยังไม่มีภาพถ่ายสต็อกในคลังเรา" };
  const snap = new Map(
    (await coreQuery(`SELECT sku, qty, name FROM stock_snapshots WHERE day = ?`, [day])).map((r) => [
      String(r.sku).trim(),
      { qty: num(r.qty), name: r.name },
    ])
  );

  const rows = (await shopeeStock()).filter((r) => r.sku && !snap.has(r.sku));
  const out = rows.map((r) => {
    const base = baseCandidates(r.sku).find((b) => snap.has(b));
    return {
      sku: r.sku,
      name: r.name,
      shopee: r.qty,
      baseSku: base || null,
      baseQty: base ? snap.get(base).qty : null,
      baseName: base ? snap.get(base).name : null,
    };
  });
  const mapped = out.filter((r) => r.baseSku).length;
  return {
    day,
    total: out.length,
    mappedToBase: mapped, // จับคู่กับรหัสฐานได้ = แค่ชื่อคนละระดับ ไม่ใช่ของหาย
    unknown: out.length - mapped, // ไม่มีเค้าใน ZORT เลย = ต้องตามหาว่าคืออะไร
    rows: out,
  };
}

/** เทียบสต็อก Shopee กับภาพถ่ายสต็อกล่าสุดในคลังเรา — อ่านอย่างเดียว */
export async function shopeeStockCompare() {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const t = await validToken();
  if (!t) return { skip: "ยังไม่ได้เชื่อมร้าน Shopee" };

  const rows = await shopeeStock();
  const withSku = rows.filter((r) => r.sku);

  // ภาพถ่ายสต็อกล่าสุดของเรา (ถ่ายตี 1 จากแคช ZORT)
  const day = (await coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`))[0]?.d;
  if (!day) {
    return { note: "ยังไม่มีภาพถ่ายสต็อกในคลังเรา", shopeeSkus: withSku.length };
  }
  const snap = new Map(
    (await coreQuery(`SELECT sku, qty FROM stock_snapshots WHERE day = ?`, [day])).map((r) => [
      String(r.sku).trim(),
      num(r.qty),
    ])
  );

  const diff = [];
  const missingSample = [];
  let same = 0;
  let missing = 0;
  for (const r of withSku) {
    if (!snap.has(r.sku)) {
      missing += 1;
      // Shopee มี SKU นี้ แต่คลังเราไม่รู้จัก — คนละเรื่องกับ "ตัวเลขไม่ตรง"
      // ต้องเห็นตัวอย่างด้วย ไม่งั้นบอกไม่ได้ว่าเป็นสินค้าที่ไม่มีใน ZORT
      // หรือเป็นแค่ชื่อ SKU เขียนคนละแบบ (ตัวพิมพ์ · ขีด · เว้นวรรค)
      if (missingSample.length < 20) missingSample.push({ sku: r.sku, name: r.name });
      continue;
    }
    const ours = snap.get(r.sku);
    if (ours === r.qty) same += 1;
    else diff.push({ sku: r.sku, name: r.name, shopee: r.qty, core: ours, gap: ours - r.qty });
  }
  diff.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  return {
    day,
    snapshotRows: snap.size, // คลังเรารู้จักกี่ SKU ในวันนั้น — ตัวหารของเรื่องนี้
    shopeeRows: rows.length,
    shopeeSkus: withSku.length,
    noSku: rows.length - withSku.length,
    same,
    missing,
    missingSample,
    negativeInCore: [...snap.values()].filter((v) => v < 0).length,
    diffCount: diff.length,
    diff: diff.slice(0, 50),
  };
}
