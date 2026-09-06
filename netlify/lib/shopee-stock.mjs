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
import { getStore } from "@netlify/blobs";
import { validToken, shopCall } from "./shopee.mjs";

/* ⚠️ **แก้ตรรกะที่เขียนลงแคชเมื่อไหร่ ต้องเปลี่ยนชื่อคีย์ด้วยทุกครั้ง**
    ของเสียที่ถูกจำไว้แล้วจะไม่ถูกถามใหม่ ⇒ แก้โค้ดแล้วผลยังผิดเหมือนเดิม
    แล้วเราจะไปไล่หาบั๊กที่ไม่มีอยู่ (v2 = รอบที่ '?? []' จำค่าว่างถาวร) */
const CACHE_SKUS = "shopee-item-skus-v2"; // จำรหัสตัวเลือกรายสินค้า ไล่เก็บทีละรอบจนครบ
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

  /* ชื่อ + SKU ระดับสินค้า (ทีละ 50 ตามเพดาน API)
     ⚠️ **ยิงพร้อมกัน ห้ามเรียงกัน** (แก้ 5 ก.ย. 2569)
        ของเดิมวนทีละก้อนแบบ await ในลูป ⇒ สินค้า 320 ตัว = 7 รอบเรียงกัน
        Shopee ตอบรอบละราว 0.3–0.5 วิ ⇒ เสียเวลาฟรี ๆ ราว 2–3 วิ ต่อการเปิดจอหนึ่งครั้ง
        แต่ละก้อนขอคนละรายการสินค้า **ไม่มีก้อนไหนต้องรอผลของก้อนก่อนหน้า**
     ⚠️ **จำกัดที่ 4 ก้อนพร้อมกัน ห้ามปล่อยทั้งหมด** — Shopee จำกัดอัตราคำขอ
        ยิงรวดเดียว 7+ ก้อนเสี่ยงโดนตีกลับ แล้วจะกลายเป็น "ชื่อสินค้าหายไปเฉย ๆ"
        ซึ่งมองไม่ออกว่าเป็นเพราะโดนจำกัดอัตรา
     ⚠️ ก้อนที่ล้มต้องไม่ล้มทั้งรอบ — ได้ชื่อไม่ครบดีกว่าเทียบสต็อกไม่ได้เลย */
  const base = new Map();
  const chunks = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  const baseParts = await inChunks(chunks, 4, (c) =>
    shopCall("/api/v2/product/get_item_base_info", { item_id_list: c.join(",") }).catch(() => null)
  );
  for (const d of baseParts) {
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

/** บรรทัดสรุปสำหรับ Telegram ยามตี 1 — คืน null ถ้ายังตรวจไม่ได้
 *  ⚠️ ต้องเป็นบรรทัดเดียว ไม่ใช่ข้อความยาว — วันละหลายข้อความคนจะเลิกอ่าน
 *     แล้วยามที่ไม่มีใครอ่านก็ไม่ต่างอะไรกับไม่มียาม */
export async function shopeeStockLine() {
  const r = await shopeeStockCompare();
  if (r?.skip || r?.note) return null;
  const flag = r.diffCount === 0 ? "✅" : "⚠️";
  return (
    `📦 สต็อก Shopee vs คลังเรา: ตรง ${r.same} · ต่าง ${r.diffCount} ${flag}` +
    ` | คลังยังไม่รู้จัก ${r.missing} รหัส (คนละระดับกับ Shopee ไม่ใช่ของหาย)` +
    (r.negativeInCore ? ` | ⚠️ ติดลบในคลัง ${r.negativeInCore} รหัส` : "")
  );
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
  if (!day) return { skip: "ยังไม่มีภาพถ่ายสต็อกในคลังเรา" };
  const snap = new Map(
    (await coreQuery(`SELECT sku, qty, name FROM stock_snapshots WHERE day = ?`, [day])).map((r) => [
      String(r.sku).trim(),
      { qty: num(r.qty), name: r.name },
    ])
  );

  // ✅ **สูตรชุดจริงจาก ZORT — เลิกเดาได้แล้ว** (3 ก.ย. 2569)
  //    ย่อหน้าเตือนด้านบนเขียนไว้ว่า "ต้องให้ร้านตัดสินใจก่อน ห้ามเดาแทน"
  //    ตอนนี้ไม่ต้องให้ใครตัดสินใจแล้ว เพราะ **ร้านเคยตอบไว้แล้วในสูตรสินค้าชุด**
  //    ⇒ อ่านจาก bundle_items แทนการอนุมานจากชื่อ
  //    ⚠️ **สูตรเป็นภาพนิ่งเก็บครั้งเดียว ไม่ได้ซิงก์เอง** — ส่ง recipeAt ออกไปทุกครั้ง
  //       จอต้องโชว์วันที่เก็บ ไม่งั้นจะกลายเป็นตาข่ายที่เคยถูกแล้วหยุดอัปเดตเงียบ ๆ
  const recipe = new Map();
  let recipeAt = null;
  try {
    for (const r of await coreQuery(
      `SELECT bundle_sku, sku, qty, MAX(at) AS at FROM bundle_items GROUP BY bundle_sku, sku, qty`
    )) {
      const k = String(r.bundle_sku).trim();
      if (!recipe.has(k)) recipe.set(k, []);
      recipe.get(k).push({ sku: String(r.sku).trim(), qty: num(r.qty) });
      if (!recipeAt || String(r.at) > recipeAt) recipeAt = String(r.at);
    }
  } catch {
    // ยังไม่มีตาราง = ถอยไปใช้การเดาจากชื่อเหมือนเดิม ห้ามล้ม
  }

  const rows = (await shopeeStock()).filter((r) => r.sku && !snap.has(r.sku));
  const out = rows.map((r) => {
    const base = baseCandidates(r.sku).find((b) => snap.has(b));
    const parts = recipe.get(r.sku) || null;

    // จำนวนที่ประกอบได้จริง = ชิ้นส่วนที่ทำได้น้อยที่สุด (คอขวด)
    // ⚠️ **ห้ามคิดจากชิ้นส่วนตัวเดียว** ชุดหนึ่งมีได้ถึง 4 ชิ้น (เครื่อง+บาร์+โซ่+อะไหล่)
    //    คิดจากตัวเดียว = บอกว่าประกอบได้ทั้งที่โซ่หมด ⇒ ขายเกินของที่มี
    let buildable = null;
    let limitedBy = null;
    let partsOut = null;
    if (parts?.length) {
      partsOut = parts.map((p) => {
        const have = snap.has(p.sku) ? num(snap.get(p.sku).qty) : null;
        // ⚠️ **ปัดต่ำสุดที่ 0** — สต็อกฐานใน ZORT ติดลบได้จริง (01209 = -134.5 · 03413 = -66)
        //    ไม่ปัด = ได้ "ประกอบได้ -6 ชุด" ซึ่งไม่มีความหมายและทำให้ตัวเลขเทียบเพี้ยน
        const can = p.qty > 0 && have !== null ? Math.max(0, Math.floor(have / p.qty)) : null;
        return { sku: p.sku, per: p.qty, have, can };
      });
      const known = partsOut.filter((p) => p.can !== null);
      // ⚠️ ชิ้นส่วนที่คลังไม่รู้จักแม้แต่ตัวเดียว = ตอบไม่ได้ ห้ามเมินแล้วตอบเลขสวย
      if (known.length === partsOut.length && known.length) {
        const min = known.reduce((a, b) => (b.can < a.can ? b : a));
        buildable = min.can;
        limitedBy = min.sku;
      }
    }

    return {
      sku: r.sku,
      name: r.name,
      shopee: r.qty,
      baseSku: base || null,
      baseQty: base ? snap.get(base).qty : null,
      baseName: base ? snap.get(base).name : null,
      // ── จากสูตรชุดจริง ──
      hasRecipe: Boolean(parts?.length),
      parts: partsOut,
      buildable, // ประกอบได้กี่ชุดจากของในคลัง (null = ตอบไม่ได้)
      limitedBy, // ชิ้นส่วนที่เป็นคอขวด
      matchesShopee: buildable === null ? null : buildable === num(r.qty),
      // ⚠️ **ต่างกันไม่ได้แปลว่าสูตรผิด** — ตัวเลขสองตัวนี้ตอบคนละคำถาม
      //    buildable = "ของในคลังประกอบได้กี่ชุด" · shopee = "ร้านเลือกโชว์กี่ชิ้น"
      //    ร้านกดปิดของที่ใกล้หมดเองได้ (00817 เหลือ 34.5 ประกอบได้ 1 แต่ร้านตั้ง 0)
      //    ⇒ **ห้ามเอาไปดันสต็อกอัตโนมัติโดยไม่ให้ร้านดูก่อน** จะไปเปิดขายของที่ร้านตั้งใจปิด
    };
  });
  const mapped = out.filter((r) => r.baseSku).length;
  const withRecipe = out.filter((r) => r.hasRecipe).length;
  const computed = out.filter((r) => r.buildable !== null);
  const agree = computed.filter((r) => r.matchesShopee).length;
  return {
    day,
    total: out.length,
    mappedToBase: mapped, // จับคู่กับรหัสฐานได้ = แค่ชื่อคนละระดับ ไม่ใช่ของหาย
    unknown: out.length - mapped, // ไม่มีเค้าใน ZORT เลย = ต้องตามหาว่าคืออะไร
    withRecipe, // มีสูตรชุดจริง ⇒ คำนวณสต็อกดันกลับได้
    computed: computed.length,
    agreeWithShopee: agree, // คำนวณแล้วตรงกับที่ Shopee โชว์อยู่จริง
    recipeAt, // ⚠️ วันที่เก็บสูตร — จอต้องโชว์เสมอ สูตรไม่ได้ซิงก์เอง
    rows: out,
  };
}

/** เทียบสต็อก Shopee กับภาพถ่ายสต็อกล่าสุดในคลังเรา — อ่านอย่างเดียว */
export async function shopeeStockCompare(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const t = await validToken();
  if (!t) return { skip: "ยังไม่ได้เชื่อมร้าน Shopee" };

  /* ⚠️ **ยิงพร้อมกัน ห้ามเรียงกัน** (แก้ 5 ก.ย. 2569 — วัดจริง 6.7 วิ)
      ของ Shopee (ยิงออกเน็ต) · วันล่าสุดของภาพถ่าย · สูตรชุด — **ไม่มีตัวไหนต้องรอกัน**
      ตัวที่ต้องรอจริงมีตัวเดียวคือแถวภาพถ่าย เพราะต้องรู้ `day` ก่อน ⇒ อยู่รอบสอง
      ⚠️ สูตรชุดต้องมี .catch ของตัวเอง (ตารางอาจยังไม่มี) **ห้ามให้ล้มลากทั้งการเทียบ**
         ของเดิมใช้ try/catch ครอบ ซึ่งกลืน error ของเพื่อนใน Promise.all ไปด้วยถ้าเผลอครอบทั้งก้อน */
  const [rows, dayRows, rec] = await Promise.all([
    shopeeStock(),
    coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`),
    coreQuery(
      `SELECT b.sku AS sku, i.sku AS base, i.qty AS per
       FROM bundles b JOIN bundle_items i ON i.bundle_sku = b.sku
       WHERE b.active = 1`
    ).catch(() => []), // ไม่มีตารางสูตร = ถอยไปใช้วิธีเดิม ห้ามล้ม
  ]);
  const withSku = rows.filter((r) => r.sku);

  // ภาพถ่ายสต็อกล่าสุดของเรา (ถ่ายตี 1 จากแคช ZORT)
  const day = dayRows[0]?.d;
  if (!day) {
    return { skip: "ยังไม่มีภาพถ่ายสต็อกในคลังเรา", shopeeSkus: withSku.length };
  }
  const snap = new Map(
    (await coreQuery(`SELECT sku, qty FROM stock_snapshots WHERE day = ?`, [day])).map((r) => [
      String(r.sku).trim(),
      num(r.qty),
    ])
  );

  /* ── สินค้าเป็นชุด (โซ่ตัดขาย · ชุดเครื่อง) ── (5 ก.ย. 2569)
     ⚠️ **จุดบอดเดิมใหญ่มาก** — วัดแล้ว Shopee มี 320 รหัส แต่ "คลังไม่รู้จัก" ถึง **276**
        ⇒ ตัวเทียบนี้ตรวจจริงแค่ 44 รหัส (14%) แล้วรายงาน "ตรงกัน 40"
        ใครอ่านผ่าน ๆ จะเข้าใจว่าสต็อก Shopee ตรงกับคลัง ทั้งที่ 86% ไม่เคยถูกตรวจเลย
     ⇒ ใช้สูตรชุดจาก ZORT (bundle_items) แบบเดียวกับฝั่ง Lazada
        **ระบุตัวด้วยสูตร · คิดจำนวนจากม้วนแม่จริง**
     ⚠️ ห้ามใช้ bundles.available เป็นตัวเลข — เพี้ยนจากม้วนจริง −1.8% ถึง +1.5%
        และเพี้ยนไม่เท่ากันแต่ละตระกูล (ดู handoff หัวข้อกับดักแผนดันสต็อก) */
  const recipe = new Map();
  {
    const count = new Map();
    for (const r of rec) count.set(String(r.sku), (count.get(String(r.sku)) || 0) + 1);
    for (const r of rec) {
      const k = String(r.sku).trim();
      if (count.get(k) !== 1) continue; // ชุดหลายชิ้นคิดแบบนี้ไม่ได้
      const per = num(r.per);
      if (per > 0 && r.base) recipe.set(k, { base: String(r.base).trim(), per });
    }
  }

  const diff = [];
  const missingSample = [];
  let same = 0;
  let missing = 0;
  let viaRecipe = 0;
  for (const r of withSku) {
    // ชุดก่อน — ระบุตัวได้ตรงตัวจากสูตร แล้วคิดจำนวนจากม้วนแม่จริง
    const rec = recipe.get(r.sku);
    if (rec && snap.has(rec.base)) {
      viaRecipe += 1;
      const ours = Math.floor(num(snap.get(rec.base)) / rec.per);
      if (ours === r.qty) same += 1;
      else diff.push({ sku: r.sku, name: r.name, shopee: r.qty, core: ours, gap: ours - r.qty, via: "สูตรชุด" });
      continue;
    }
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
    // จับคู่ได้เพราะมีสูตรชุด (ไม่ใช่การเดา) — เดิมตกอยู่ในกอง "คลังไม่รู้จัก" ทั้งหมด
    matchedByRecipe: viaRecipe,
    bundlesWithRecipe: recipe.size,
    missing,
    missingSample,
    negativeInCore: [...snap.values()].filter((v) => v < 0).length,
    diffCount: diff.length,
    /* ⚠️ `diff` ถูกตัดที่ 50 **เพื่อการแสดงผลเท่านั้น** — ตัวจริงอยู่ใน diffCount
        ใครจะเอาไป "คิดต่อ" (เช่นแผนดันสต็อก) ต้องขอ full:1 ไม่งั้นจะคิดจากตัวอย่าง
        แล้วของหายเงียบ ๆ (เจอจริง 5 ก.ย. 2569 ดึก — แผนดันขาดไป 5 รหัสโดยไม่มีอะไรฟ้อง
        เป็นกับดัก "ตัวอย่างไม่ใช่ตัวแทน" ตัวที่ 6 ของวันเดียวกัน) */
    diff: o.full ? diff : diff.slice(0, 50),
    diffTruncated: !o.full && diff.length > 50,
  };
}

/** รหัสสินค้าที่กำลังลงขายอยู่บน Shopee (สถานะ NORMAL เท่านั้น)
 *  ⚠️ ใช้รายการสินค้าจริง ไม่ใช่ประวัติการขาย — ของที่ถอดออกไปแล้วต้องไม่ติดมาด้วย */
/** รหัสสินค้าที่ "ลงขายอยู่จริง" บน Shopee — สำหรับคอลัมน์ Marketplace
 *
 *  ⚠️ **ห้ามใช้ `shopeeStock()` ตอบคำถามนี้** — พลาดมาแล้ว 4 ก.ย. 2569 (ฝั่งจอจับได้)
 *     `shopeeStock()` ต้องยิง `get_model_list` **ทีละสินค้า** เพื่ออ่านสต็อกระดับตัวเลือก
 *     ร้านมีเกือบ 2,000 รายการ = เกือบ 2,000 คำขอ ทำไม่ทันใน 26 วินาทีของ Netlify
 *     และตัวมันมี `catch {}` กลืน error รายตัวไว้เงียบ ๆ (เจตนาเดิมคือ "อย่าล้มทั้งรอบ")
 *     ⇒ ผลลัพธ์คือได้มาแค่ **319 จาก 1,926** แล้วส่งต่อเหมือนเป็นคำตอบที่ครบถ้วน
 *     ⇒ สินค้าที่ขายบน Shopee อยู่จริงเป็นพันขึ้นจอว่า **"ไม่ได้ลงขายบน Shopee"**
 *        ซึ่งอันตรายกว่าขีดเปล่า เพราะหน้าตาเหมือนคำตอบที่ตรวจมาแล้ว
 *
 *  ⇒ คำถาม "ลงขายอยู่ไหม" **ไม่ต้องรู้จำนวนสต็อก** ⇒ ใช้แค่ get_item_list + base_info
 *     (~2,000 รายการ = 20 หน้า + 40 คำขอ) เร็วพอและได้ครบ
 *  ⚠️ **ดึงไม่ครบให้โยน error** ห้ามคืนของบางส่วน — ปลายทางแยกไม่ออกว่าเป็น
 *     "ไม่ได้ลงขาย" กับ "เราถามไม่ครบ" (marketplace-listings จะจับไปลง failed ให้เอง)
 */
export async function shopeeListedSkus() {
  const t = await validToken();
  if (!t) throw new Error("ยังไม่ได้เชื่อมร้าน Shopee");

  // ① รายชื่อสินค้าทั้งหมดที่สถานะปกติ (เร็ว ~20 หน้า)
  const ids = [];
  let offset = 0;
  let more = true;
  for (let p = 0; p < 40 && more; p++) {
    const d = await shopCall("/api/v2/product/get_item_list", {
      offset: String(offset),
      page_size: "100",
      item_status: "NORMAL",
    });
    for (const it of d?.response?.item ?? []) ids.push(it.item_id);
    more = Boolean(d?.response?.has_next_page);
    offset += 100;
  }
  if (more) throw new Error("รายการสินค้า Shopee ยาวเกิน 4,000 รายการ — ดึงไม่ครบ");
  if (!ids.length) return new Set();

  /* ② รหัสจริงอยู่ระดับ "ตัวเลือก" ⇒ ต้องถาม get_model_list ทีละสินค้า (~2,000 คำขอ)
     ทำครั้งเดียวไม่ทัน 26 วินาที ⇒ **จำผลรายสินค้าไว้ แล้วไล่เก็บทีละรอบจนครบ**
     รอบต่อ ๆ ไปเหลือแค่สินค้าที่เพิ่งเพิ่มเข้ามา จึงเร็ว
     ⚠️ ยังไม่ครบ = **โยน error** ห้ามคืนของบางส่วน ไม่งั้นจอจะบอกว่า "ไม่ได้ลงขาย"
        ให้ของที่เรายังไม่ทันถาม (เจอของจริง 4 ก.ย. 2569 — ตอบ 319 จาก 1,926) */
  const store = getStore("gucut-coupon");
  const cached = (await store.get(CACHE_SKUS, { type: "json" }).catch(() => null)) || {};
  const known = new Map(Object.entries(cached.byItem || {}));

  const todo = ids.filter((id) => !known.has(String(id)));
  const deadline = Date.now() + 16000; // เหลือเวลาให้ช่องทางอื่นและตัวเรียกด้วย
  let done = 0;
  for (let i = 0; i < todo.length && Date.now() < deadline; i += 8) {
    const chunk = todo.slice(i, i + 8); // 8 พร้อมกัน — มากกว่านี้ Shopee เริ่มตอบ error
    const got = await Promise.all(
      chunk.map(async (id) => {
        try {
          const d = await shopCall("/api/v2/product/get_model_list", { item_id: String(id) });
          /* ⚠️ **ต้องเช็คว่า `model` เป็น array จริง ๆ ก่อนจำผล** — พลาดมาแล้ว 4 ก.ย. 2569
              Shopee ตอบ 200 พร้อมช่อง error ได้ (โดนจำกัดอัตรา / สินค้าอ่านไม่ได้)
              เขียน `?? []` = ตีความว่า "สินค้าตัวนี้ไม่มีตัวเลือกเลย" แล้ว**จำค่าว่างถาวร**
              ⇒ ตัวนับบอกว่าเก็บครบแล้ว ทั้งที่รหัสหายไปเกือบหมด (ได้ 15 จาก ~300 รหัส)
              โรคเดียวกับ `catch {}` ที่เพิ่งแก้ไป แค่เปลี่ยนหน้ากาก */
          const models = d?.response?.model;
          if (!Array.isArray(models)) return null; // ไม่จำ = รอบหน้ามาเก็บต่อ
          const skus = models.map((m) => String(m.model_sku || "").trim()).filter(Boolean);
          // สินค้าไม่มีตัวเลือก ⇒ รหัสอยู่ระดับสินค้า ต้องไม่ทิ้ง
          if (!models.length) {
            const b = await shopCall("/api/v2/product/get_item_base_info", { item_id_list: String(id) });
            const one = b?.response?.item_list?.[0];
            const k = String(one?.item_sku ?? "").trim();
            return [String(id), k ? [k] : []];
          }
          return [String(id), skus];
        } catch {
          return null; // ไม่กลืน — แค่ยังไม่จำ รอบหน้ามาเก็บต่อ
        }
      })
    );
    for (const g of got) if (g) { known.set(g[0], g[1]); done += 1; }
  }
  if (done) {
    await store.setJSON(CACHE_SKUS, { at: Date.now(), byItem: Object.fromEntries(known) });
  }

  const missing = ids.filter((id) => !known.has(String(id))).length;
  if (missing) {
    throw new Error(
      `กำลังไล่เก็บรหัสสินค้า Shopee — ได้แล้ว ${ids.length - missing}/${ids.length} รายการ ` +
        `(เหลืออีก ${missing}) ยังไม่ครบจึงยังไม่ใช้ ลองใหม่อีกครั้ง`
    );
  }

  const out = new Set();
  for (const id of ids) for (const k of known.get(String(id)) || []) out.add(k);
  return out;
}

