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
import { รอบที่คาดหวัง } from "./core-freshness.mjs";
import { recipeCheckedAt } from "./core-products.mjs";
import { getStore } from "@netlify/blobs";
import { validToken, shopCall } from "./shopee.mjs";
/* ตัวแปลงวันไทยอยู่ที่ lib/thaiday.mjs ที่เดียว — เดิมไฟล์นี้มีสำเนาของตัวเอง (รวมแล้ว 18 ก.ย. 2569)
   เหตุผล: สูตรเดียวกันอยู่หลายที่ = วันที่ใครแก้ข้างเดียว สองที่จะให้คำตอบต่างกันเงียบ ๆ */
import { thaiDayFromUtc } from "./thaiday.mjs";


/* ⚠️ **แก้ตรรกะที่เขียนลงแคชเมื่อไหร่ ต้องเปลี่ยนชื่อคีย์ด้วยทุกครั้ง**
    ของเสียที่ถูกจำไว้แล้วจะไม่ถูกถามใหม่ ⇒ แก้โค้ดแล้วผลยังผิดเหมือนเดิม
    แล้วเราจะไปไล่หาบั๊กที่ไม่มีอยู่ (v2 = รอบที่ '?? []' จำค่าว่างถาวร) */
const CACHE_SKUS = "shopee-item-skus-v2"; // จำรหัสตัวเลือกรายสินค้า ไล่เก็บทีละรอบจนครบ
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** อ่านสต็อกที่ผู้ขายตั้งไว้จากคำตอบ Shopee — คืน `null` เมื่อ **เดินตามเส้นทางไม่ถึงหรืออ่านไม่ออก**
 *
 *  🔴 ทำไมต้องมี (19 ก.ย. 2569 · ใบ t_mu7uzpld) — เส้นทางนี้ลึกสี่ชั้น
 *     `m.stock_info_v2.seller_stock[0].stock` ⇒ Shopee เปลี่ยนชื่อชั้นไหนก็ได้ (เคยเปลี่ยนจาก
 *     `stock_info` เป็น `stock_info_v2` มาแล้วจริง ๆ — เลข v2 ในชื่อคือหลักฐาน)
 *     ของเดิมใช้ `num()` ⇒ เส้นทางขาด ⇒ `undefined` ⇒ NaN ⇒ **0**
 *     ⇒ ทุกแถวอ่านได้ 0 ⇒ **แผนดันสต็อกเห็นว่า Shopee ไม่มีของทั้งร้าน** ⇒ ดันทั้ง 1,870 รหัส
 *       (หรือกลับกัน: สรุปว่าไม่มีอะไรต้องดัน) ⇒ ค่าที่ผิด **ออกไปแตะของจริงบนมาร์เก็ตเพลส**
 *  🔑 `0` เป็นคำตอบที่ถูกได้เสมอ (ของหมดจริง) ⇒ ต้องแยก "ไม่มีเส้นทาง" ออกจาก "ค่าเป็นศูนย์"
 *     ⇒ ด่านจึงผูกกับ **เส้นทางขาด** ไม่ใช่ค่า 0 — ไม่งั้นวันที่ของหมดจริงด่านจะร้อง (แดงลวง) */
export function อ่านสต็อกผู้ขาย(m) {
  const v = m?.stock_info_v2?.seller_stock?.[0]?.stock;
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

/** ยิงหลายงานพร้อมกันทีละก้อน — Netlify ให้ฟังก์ชันรอผลได้ 26 วินาที */
async function inChunks(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

/** อ่านสต็อกทุก SKU ที่ขายอยู่บน Shopee (รวมระดับตัวเลือกสินค้า) */
/** ไล่หน้ารายการสินค้า — **แยกออกมาเพื่อทดสอบได้ด้วยหน้าปลอม โดยเดินโค้ดเส้นเดียวกับของจริง**
 *  คืน { ids, declared, sawAll } · `declared` = ยอดที่ Shopee ประกาศ (null = ไม่ได้บอกมา)
 *
 *  🔴 ทำไมต้องมีตัวนับเทียบ (11 ก.ย. 2569): ไฟล์นี้ **ไม่มีตาข่ายกันไล่หน้าไม่ครบเลย**
 *     ถ้า has_next_page หลุดหรือ API ตอบหน้าเปล่ากลางทาง ⇒ ได้รายการบางส่วน
 *     แล้วทุกตัวนับข้างล่าง (same · missing · diffCount) ต่ำกว่าจริงทั้งหมด **โดยไม่มีอะไรฟ้อง**
 *     ⇒ ตัวหารต้องมาจากนอกกอง = ยอดที่แพลตฟอร์มประกาศ ไม่ใช่ความยาวอาร์เรย์ของตัวเอง
 */
export async function collectShopeeItemIds(fetchPage, status = "NORMAL") {
  const ids = [];
  let declared = null;
  let offset = 0;
  for (let p = 0; p < 25; p++) {
    const d = await fetchPage({ offset: String(offset), page_size: "100", item_status: status });
    /* ยอดรวมที่ Shopee ประกาศเอง — อ่านจากหน้าแรกพอ
       ⚠️ อ่านไม่ได้ = null **ห้ามแทนด้วย 0** (ไม่รู้ ≠ ไม่มี) */
    if (declared === null && Number.isFinite(Number(d?.response?.total_count))) {
      declared = Number(d.response.total_count);
    }
    for (const it of d?.response?.item ?? []) ids.push(it.item_id);
    if (!d?.response?.has_next_page) break;
    offset += 100;
  }
  /* true = ได้ครบตามที่แพลตฟอร์มบอก · false = ไล่หน้าไม่ครบ **ห้ามใช้ตัวเลขต่อ**
     null = แพลตฟอร์มไม่ได้บอกยอดรวม ⇒ ยังไม่ได้ตรวจ (ไม่ใช่ผ่าน) */
  return { ids, declared, sawAll: declared === null ? null : ids.length === declared };
}

/* status: "NORMAL" (ค่าเดิม ทุกผู้เรียกเดิมไม่ต้องแก้) · "UNLIST" = สินค้าที่ถอดออกจากหน้าร้าน */
async function shopeeStock(status = "NORMAL") {
  const got = await collectShopeeItemIds((query) => shopCall("/api/v2/product/get_item_list", query), status);
  const ids = got.ids;
  /* ⚠️ ไม่มี id เลย ⇒ คืนอาร์เรย์ว่างพร้อมผลตรวจความครบ · **ตัวตัดสินว่าจะหยุดหรือไม่
     อยู่ที่ shopeeStockCompare** (ที่นี่เป็นแค่ตัวดึง ไม่ควรตัดสินใจแทนผู้เรียกทุกคน) */
  /* ⚠️ รูปคำตอบต้องเหมือนทางออกปกติ — ขาดคีย์ = ปลายทางแยก "ท่อรุ่นเก่า" จาก "ศูนย์จริง" ไม่ออก */
  if (!ids.length) return Object.assign([], { coverage: got, qtyUnreadable: 0, rowsSeen: 0 });

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
  /* ตัวนับ "อ่านสต็อกไม่ได้" — นับเสมอ เพื่อให้ด่านข้างล่างมีตัวเลขของตัวเองให้ดู
     (ด่านที่ไม่เคยเห็นตัวเลขของตัวเอง คือด่านที่พิสูจน์ไม่ได้ว่าเคยทำงาน) */
  let อ่านสต็อกไม่ได้ = 0;
  await inChunks(ids, 8, async (id) => {
    const b = base.get(id) || {};
    try {
      const d = await shopCall("/api/v2/product/get_model_list", { item_id: String(id) });
      const models = d?.response?.model ?? [];
      if (models.length) {
        for (const m of models) {
          // seller_stock = จำนวนที่ผู้ขายตั้งไว้ (ตัวที่ ZORT ดันมา) ไม่ใช่ยอดที่ถูกจองไว้
          const qtyอ่านได้ = อ่านสต็อกผู้ขาย(m);
          if (qtyอ่านได้ === null) อ่านสต็อกไม่ได้++;
          const qty = qtyอ่านได้ ?? 0;
          rows.push({
            /* ⚠️ ค่ายังเป็น 0 เหมือนเดิม **โดยตั้งใจ** — เปลี่ยนชนิดเป็น null ต้องนัดกับฝั่งจอก่อน
               รอบนี้เพิ่มธงบอกความจริงไว้ข้าง ๆ ให้จอเลือกใช้เมื่อพร้อม (ฝั่งรับเตรียมช่องไว้ก่อน) */
            qtyUnreadable: qtyอ่านได้ === null,
            itemId: id,
            /* ที่อยู่สำหรับยิงเขียนสต็อก (update_stock ต่อ item_id + model_id) — เพิ่ม 17 ก.ย. 2569 ตัวยิง Shopee */
            modelId: m.model_id ?? null,
            sku: String(m.model_sku || "").trim(),
            name: `${b.item_name || ""} ${m.model_name || ""}`.trim().slice(0, 120),
            qty,
          });
        }
      } else {
        const s = d?.response?.tier_variation?.length ? null : b;
        /* 🔴 `s` เป็น null โดยตั้งใจเมื่อ "มีตัวเลือกแต่อ่าน model ไม่ได้" ⇒ **เราไม่รู้สต็อก**
           แต่ของเดิม `num(null)` ให้ **0** ⇒ บันทึกว่า "Shopee มี 0 ชิ้น" ทั้งที่ความจริงคือไม่รู้
           ⇒ แถวนี้ไหลเข้าแผนดันสต็อกเหมือนแถวปกติ (กฎ: ?. ฝั่งซ้ายไม่ได้กันฝั่งขวา) */
        const qty2 = อ่านสต็อกผู้ขาย(s);
        if (qty2 === null) อ่านสต็อกไม่ได้++;
        rows.push({
          qtyUnreadable: qty2 === null,
          itemId: id,
          /* สินค้าไม่มีตัวเลือก ⇒ update_stock ใช้ model_id 0 · แต่ถ้ามี tier_variation แต่อ่าน model ไม่ได้ = ไม่รู้ที่อยู่ */
          modelId: d?.response?.tier_variation?.length ? null : 0,
          sku: String(b.item_sku || "").trim(),
          name: String(b.item_name || "").slice(0, 120),
          qty: qty2 ?? 0,
        });
      }
    } catch {
      // สินค้าตัวเดียวอ่านไม่ได้ ไม่ควรล้มทั้งรอบ — ข้ามไปแล้วรายงานจำนวนที่ได้
    }
    return null;
  });
  /* ⚠️ แนบผลตรวจความครบไปกับอาร์เรย์ (ไม่เปลี่ยนสัญญาเดิมของฟังก์ชันนี้ที่คืนอาร์เรย์)
     ผู้เรียกที่อยากรู้ว่า "ไล่หน้าครบไหม" อ่าน `rows.coverage` ได้
     ⚠️ JSON.stringify ไม่เก็บ property ของอาร์เรย์ ⇒ ผู้เรียกต้องยกขึ้นคำตอบเอง
        (shopeeStockCompare ทำให้แล้ว) · เขียนกำกับเพราะจุดนี้มองไม่เห็นจากปลายทาง */
  /* 🔴 แนบตัวนับ "อ่านสต็อกไม่ได้" ไปกับผล — **ตัวนี้ไม่ตัดสินใจเอง**
     การตัดสินว่า "อ่านไม่ได้เท่าไหร่ถึงจะหยุด" อยู่ที่ `shopeeStockCompare` ที่เดียว
     (กติกาเดียวกับฝั่ง Lazada: เหตุผลอยู่ที่เดียว ไม่กระจายไปตามตัวเก็บของ) */
  return Object.assign(rows, {
    coverage: got,
    qtyUnreadable: อ่านสต็อกไม่ได้,
    rowsSeen: rows.length,
  });
}

/** รวมผล "สินค้าที่ถอดจากหน้าร้าน Shopee คลังเรามีของไหม" — ฟังก์ชันล้วน (ทดสอบด้วยข้อมูลปลอมได้)
 *  @param rows    [{ itemId, sku, name, qty }] จาก shopeeStock("UNLIST")
 *  @param snap    Map<sku, { qty }> ภาพถ่ายสต็อกคลังเรา
 *  @param recipe  Map<skuชุด, [{ sku, qty }]> สูตรชุดจาก ZORT
 *
 *  🔴 **หน่วยต้องแยกเสมอ** — Shopee โชว์ UNLIST เป็น "สินค้า" (135) แต่คลังนับเป็น "รหัส"
 *     สินค้าหนึ่งตัวมีหลายตัวเลือก ⇒ ห้ามเอาจำนวนรหัสไปเทียบกับ 135 ตรง ๆ
 *     สินค้า "มีของ" = มีตัวเลือกอย่างน้อยหนึ่งตัวที่คลังมีของ
 *  ⚠️ **ไม่รู้ ≠ ไม่มี** — รหัสว่าง/คลังไม่รู้จัก/สูตรมีชิ้นส่วนที่ไม่รู้จัก ⇒ "unknown" ห้ามนับเป็นศูนย์
 *  ⚠️ ของชุดใช้ buildable จากสูตร (แบบเดียวกับ stockcompare และสูตรที่ ZORT ใช้)
 *     ตัวเลือกความยาวหลายตัวดึงม้วนเดียวกัน ⇒ **ห้ามบวกจำนวนข้ามตัวเลือก** ใช้ได้แค่ "มี/ไม่มี"
 */
export function summarizeUnlisted(rows, snap, recipe) {
  const skuState = (sku) => {
    if (!sku) return { state: "unknown", why: "ไม่ได้กรอกรหัสบน Shopee", have: null, via: null };
    const parts = recipe.get(sku);
    if (parts?.length) {
      const cans = parts.map((p) =>
        p.qty > 0 && snap.has(p.sku) ? Math.max(0, Math.floor(num(snap.get(p.sku).qty) / p.qty)) : null
      );
      if (cans.some((c) => c === null))
        return { state: "unknown", why: "สูตรชุดมีชิ้นส่วนที่คลังไม่รู้จัก", have: null, via: "สูตรชุด" };
      const have = Math.min(...cans);
      return { state: have > 0 ? "stock" : "none", have, via: "สูตรชุด" };
    }
    if (!snap.has(sku)) return { state: "unknown", why: "คลังไม่รู้จักรหัสนี้", have: null, via: null };
    const have = num(snap.get(sku).qty);
    return { state: have > 0 ? "stock" : "none", have, via: "ตรงตัว" };
  };

  const items = new Map();
  const skus = { stock: 0, none: 0, unknown: 0 };
  for (const r of rows) {
    const s = skuState(String(r.sku || "").trim());
    skus[s.state] += 1;
    if (!items.has(r.itemId)) items.set(r.itemId, { itemId: r.itemId, name: r.name, variants: [] });
    items.get(r.itemId).variants.push({ sku: r.sku || null, shopeeQty: num(r.qty), ...s });
  }

  const byItem = { stock: [], none: [], unknown: [] };
  for (const it of items.values()) {
    const st = it.variants.some((v) => v.state === "stock")
      ? "stock"
      : it.variants.some((v) => v.state === "none")
        ? "none"
        : "unknown";
    byItem[st].push(it);
  }
  return {
    items: items.size,
    itemsWithStock: byItem.stock.length,
    itemsNoStock: byItem.none.length,
    itemsUnknown: byItem.unknown.length,
    skus: rows.length,
    skusWithStock: skus.stock,
    skusNoStock: skus.none,
    skusUnknown: skus.unknown,
    withStock: byItem.stock.map((it) => ({
      itemId: it.itemId,
      name: it.name,
      variantsWithStock: it.variants.filter((v) => v.state === "stock").map((v) => ({ sku: v.sku, have: v.have, via: v.via })),
    })),
    unknown: byItem.unknown.map((it) => ({ itemId: it.itemId, name: it.name, why: [...new Set(it.variants.map((v) => v.why))] })),
  };
}

/** GET ?shopeeunlisted=1 — อ่านอย่างเดียว ไม่เขียนอะไรกลับ Shopee */
export async function shopeeUnlistedStock() {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  if (!(await validToken())) return { skip: "ยังไม่ได้เชื่อมร้าน Shopee" };
  const day = (await coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`))[0]?.d;
  if (!day) return { skip: "ยังไม่มีภาพถ่ายสต็อกในคลังเรา" };
  const snap = new Map(
    (await coreQuery(`SELECT sku, qty FROM stock_snapshots WHERE day = ?`, [day])).map((r) => [
      String(r.sku).trim(),
      { qty: num(r.qty) },
    ])
  );
  const recipe = new Map();
  let recipeAt = null;
  for (const r of await coreQuery(`SELECT bundle_sku, sku, qty, MAX(at) AS at FROM bundle_items GROUP BY bundle_sku, sku, qty`)) {
    const k = String(r.bundle_sku).trim();
    if (!recipe.has(k)) recipe.set(k, []);
    recipe.get(k).push({ sku: String(r.sku).trim(), qty: num(r.qty) });
    if (!recipeAt || String(r.at) > recipeAt) recipeAt = String(r.at);
  }

  const rows = await shopeeStock("UNLIST");
  const cov = rows.coverage || {};
  /* ⚠️ ไล่หน้าไม่ครบ ⇒ ตัวนับทุกตัวต่ำกว่าจริง **ห้ามส่งเลขออกไปเหมือนผลสมบูรณ์** */
  if (cov.sawAll === false)
    return { skip: `ไล่รายการ UNLIST ไม่ครบ (ได้ ${cov.ids?.length ?? "?"} จากที่ Shopee ประกาศ ${cov.declared})` };
  const checkedAt = await recipeCheckedAt();
  return {
    /* 📅 **สามช่องนี้เป็น "วันไทย" ทุกช่อง** (ชื่อมี TH กำกับ) — จอเอาไปคิดอายุได้ตรง ๆ ไม่ต้องแปลง
       `stockDay` เดิมยังส่งไว้เพื่อไม่ให้จอรุ่นเก่าพัง (ค่าเท่ากับ stockDayTH อยู่แล้ว) */
    stockDay: day,
    stockDayTH: day,              // ภาพถ่ายสต็อกล่าสุด — เขียนด้วย thaiDayOffset(0) ⇒ วันไทยอยู่แล้ว
    recipeDayTH: thaiDayFromUtc(recipeAt),          // สูตรสินค้าชุดเปลี่ยนล่าสุด (แปลงจาก UTC แล้ว)
    recipeCheckedDayTH: thaiDayFromUtc(checkedAt),  // ตรวจสูตรกับ ZORT ล่าสุด (แปลงจาก UTC แล้ว)
    recipeAt,
    recipeCheckedAt: checkedAt, // ตรวจสูตรกับ ZORT ล่าสุด (UTC) · recipeAt = สูตรเปลี่ยนล่าสุด (UTC)
    /* 🔑 **รอบที่คาดหวังต้องมาคู่กับเวลาที่ส่งไปเสมอ** (เพิ่ม 19 ก.ย. 2569)
        เส้นนี้ส่ง `recipeCheckedAt` เหมือน `list=bundles` **แต่เดิมไม่ส่งรอบที่คาดหวัง**
        ⇒ จอที่อ่านเส้นนี้ต้องเดาเกณฑ์เอง ⇒ คลาสเดิมที่ทำให้เกณฑ์ 6 ชม.ไปโผล่ในโค้ดจอ
        (ฝั่งจอเตือนเรื่องนี้เองว่า "เพิ่มสถานะใหม่แล้วเกือบลืมจอรายตัว" ⇒ ผมไปตรวจตามแล้วเจอ)
        🔑 **ส่งเวลาไปที่ไหน ต้องส่งรอบที่คาดหวังไปที่นั้น** ไม่งั้นปลายทางไม่มีทางรู้ว่าเก่าแค่ไหนถึงผิดปกติ */
    ...(await รอบที่คาดหวัง("bundle-recipe-sync")),
    declaredByShopee: cov.declared ?? null,
    sawAll: cov.sawAll ?? null,
    ...summarizeUnlisted(rows, snap, recipe),
    note:
      "items = สินค้า (หน่วยเดียวกับเลข UNLIST บน Shopee) · skus = ตัวเลือก · " +
      "สินค้ามีของ = มีตัวเลือกอย่างน้อยหนึ่งตัวที่คลังมีของ · unknown = ไม่รู้ ไม่ใช่ไม่มี · " +
      "ตัวเลือกความยาวโซ่ดึงม้วนเดียวกัน ห้ามบวก have ข้ามตัวเลือก",
  };
}

/** บรรทัดสรุปสำหรับ Telegram ยามตี 1 — คืน null ถ้ายังตรวจไม่ได้
 *  ⚠️ ต้องเป็นบรรทัดเดียว ไม่ใช่ข้อความยาว — วันละหลายข้อความคนจะเลิกอ่าน
 *     แล้วยามที่ไม่มีใครอ่านก็ไม่ต่างอะไรกับไม่มียาม */
export async function shopeeStockLine() {
  const r = await shopeeStockCompare();
  /* 🔴 **ห้ามเช็ค `r.note` ตรงนี้อีก** — คลาสบั๊กที่ระเบิดจริงในไฟล์พี่น้อง 6 ก.ย. 2569
      ฝั่ง Lazada เคยเขียน `if (c.skip || c.note)` แล้ววันที่มีคนเติม `note`
      (= คำอธิบายคอลัมน์) เข้าไปในผลที่**สำเร็จ** ⇒ แผนดันสต็อกไม่เคยถูกคำนวณเลยสักครั้ง
      **ไม่มี error ไม่มีเลขผิด** จอขึ้นว่า "ข้าม" พร้อมเหตุผลยาวที่อ่านแล้วดูสมเหตุสมผล
      ⇒ กติกา: `skip` = ทำต่อไม่ได้ · `note` = คำอธิบายผลที่สำเร็จ **ห้ามเอามาปนกัน**
      (วันนี้ shopeeStockCompare ยังไม่คืน `note` ตอนสำเร็จ — แต่ตัวกันนี้มีไว้กันวันที่มีคนเติม
       เพราะถ้าเติมแล้วพัง มันจะพังแบบ "บรรทัดยามหายไปเงียบ ๆ" ซึ่งไม่มีใครสังเกต) */
  if (r?.skip) return null;
  const flag = r.diffCount === 0 ? "✅" : "⚠️";
  /* ⚠️ ตัวเลข "คลังไม่รู้จัก" เชื่อไม่ได้ถ้าถามสูตรชุดไม่ได้ — ต้องเขียนกำกับในบรรทัดเดียวกัน
      ไม่ใช่ปล่อยให้คนอ่านตัวเลขที่สูงเกินจริงแล้วไปไล่หาของที่ไม่ได้หาย */
  const recipeWarn = r.recipeError ? " | ⚠️ ถามสูตรชุดไม่ได้ ตัวเลข 'คลังไม่รู้จัก' สูงเกินจริง" : "";
  return (
    `📦 สต็อก Shopee vs คลังเรา: ตรง ${r.same} · ต่าง ${r.diffCount} ${flag}` +
    ` | คลังยังไม่รู้จัก ${r.missing} รหัส (คนละระดับกับ Shopee ไม่ใช่ของหาย)` +
    (r.negativeInCore ? ` | ⚠️ ติดลบในคลัง ${r.negativeInCore} รหัส` : "") +
    recipeWarn
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
  //    ⚠️ สูตรเคยเป็นภาพนิ่ง 3 ก.ย. — **ซิงก์จาก ZORT ทุกชั่วโมงตั้งแต่ 14 ก.ย. 2569** (bundle-recipe-sync)
  //       ยังส่ง recipeAt (สูตรเปลี่ยนล่าสุด) + recipeCheckedAt (ตรวจล่าสุด) ออกไปทุกครั้ง
  //       ซิงก์หยุดเมื่อไหร่ recipeCheckedAt จะเก่า ⇒ จอเห็นได้ ไม่กลายเป็นตาข่ายที่หยุดอัปเดตเงียบ ๆ
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
  /* 🔴 **รหัสซ้ำในต้นทาง — ห้าม DISTINCT ทิ้ง** (เพิ่ม 19 ก.ย. 2569)
      ฝั่งจอขอ DISTINCT เพราะเห็น `03386-33.5T` โผล่สองแถว ⇒ ผมไปดูเนื้อแถวก่อนทำตาม
      **สองแถวนั้นเป็นสินค้าคนละตัวที่ใช้รหัสเดียวกันบน Shopee**:
        แถว 1 = "…Titanium100% (แบบซอย)" · shopee 0
        แถว 2 = "…ทองคำผสมไทเทเนียม (แบบตัด)" · shopee 575
      ⇒ ยุบทิ้งหนึ่งแถว = **ทำของจริงหาย** (ตัวที่มี 575 ชิ้น หรือตัวที่ 0)
        และเป็นการซ่อนปัญหาที่ร้านต้องรู้: รหัสซ้ำบนแพลตฟอร์มทำให้ดันสต็อกไปทับกัน
      🔑 [[duplicates-are-not-equal-keep-the-one-in-the-right-place]] — ซ้ำไม่ได้แปลว่าเหมือน
      ⇒ ท่าที่ถูก: **ไม่ยุบ แต่ประกาศว่ามีซ้ำ** ให้ปลายทางเขียนบอกคนใช้ได้
      ⚠️ `total` ยังนับทุกแถว (รวมซ้ำ) ⇒ ตรงกับจำนวนแถวที่ส่งไปเสมอ
         ปลายทางเทียบ `rows.length === total` ได้ต่อโดยไม่ต้องแก้อะไร */
  const นับรหัส = new Map();
  for (const r of out) นับรหัส.set(r.sku, (นับรหัส.get(r.sku) ?? 0) + 1);
  const duplicateSkus = [...นับรหัส].filter(([, n]) => n > 1).map(([sku, n]) => ({ sku, rows: n }));

  /* 🔴 **ลำดับต้องคงที่** (เพิ่ม 19 ก.ย. 2569) — เดิมลำดับมาจาก Shopee API ตามใจเขา
      ยิงสองครั้งได้ชุดเดียวกันแต่เรียงต่างกัน ⇒ ฝั่งจอเรียงตามรหัสในหัวคนใช้อยู่แล้ว
      และวันที่รายการเกิน 300 แถว (จอแสดง 300 แถวแรก) **300 แถวที่เห็นจะเป็นคนละชุดทุกครั้ง**
      โดยกล่องเตือนของจอไม่ร้อง เพราะมันเตือนเรื่อง "แถวถูกตัด" ไม่ใช่ "แถวสลับ"
      ⇒ เรียงด้วยรหัส แล้วตัวซ้ำจะอยู่ติดกันด้วย ⇒ คนเห็นเองว่าซ้ำ */
  out.sort((a, b) => String(a.sku).localeCompare(String(b.sku), "en"));

  return {
    day,
    total: out.length,
    /* ⚠️ `[]` = ตรวจแล้วไม่มีรหัสซ้ำ (ต่างจากไม่มีคีย์ = ท่อรุ่นเก่ายังไม่ตรวจ) */
    duplicateSkus,
    duplicateNote: duplicateSkus.length
      ? "มีรหัสที่โผล่มากกว่าหนึ่งแถว — **เป็นสินค้าคนละตัวที่ใช้รหัสเดียวกันบนแพลตฟอร์ม** ไม่ใช่ข้อมูลซ้ำ ⇒ ท่อไม่ยุบให้ · ร้านต้องแก้รหัสที่ต้นทาง ไม่งั้นดันสต็อกจะทับกัน"
      : "ไม่มีรหัสซ้ำในรอบนี้",
    sortedBy: "sku (คงที่ทุกคำขอ — ลำดับจาก Shopee API ไม่คงที่ จึงเรียงเองที่ท่อ)",
    mappedToBase: mapped, // จับคู่กับรหัสฐานได้ = แค่ชื่อคนละระดับ ไม่ใช่ของหาย
    unknown: out.length - mapped, // ไม่มีเค้าใน ZORT เลย = ต้องตามหาว่าคืออะไร
    withRecipe, // มีสูตรชุดจริง ⇒ คำนวณสต็อกดันกลับได้
    computed: computed.length,
    agreeWithShopee: agree, // คำนวณแล้วตรงกับที่ Shopee โชว์อยู่จริง
    recipeAt, // ⚠️ สูตรเปลี่ยนล่าสุด — ไม่ใช่เวลาตรวจ (สูตรที่ไม่เปลี่ยนจะเก่าตลอดไป)
    recipeCheckedAt: await recipeCheckedAt(), // ตรวจสูตรกับ ZORT ล่าสุด (UTC) · null = ไม่รู้
    rows: out,
  };
}

/** เทียบสต็อก Shopee กับภาพถ่ายสต็อกล่าสุดในคลังเรา — อ่านอย่างเดียว */
/** รวมแถวเป็น { รหัส: [ที่อยู่…] } — ใช้ทั้ง Shopee และ TikTok */
export function ที่อยู่ของรหัส(rows, pick) {
  const out = {};
  for (const r of rows) {
    if (!r?.sku) continue;
    (out[r.sku] ||= []).push(pick(r));
  }
  return out;
}

/** 🏷️ ป้ายเหตุที่ "จับคู่รหัสกับคลังไม่ได้" — **แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพื่อให้ทดสอบได้**
 *  เดิมตรรกะนี้ฝังอยู่กลางลูปที่ต้องยิงเน็ตก่อนจะถึง ⇒ เขียนเทสต์ให้แตะของจริงไม่ได้
 *  ⇒ ถ้าปล่อยไว้ เทสต์จะกลายเป็นของประดับที่เขียวโดยไม่เคยเรียกโค้ดนี้เลย
 *  @param จำนวนชิ้นส่วน  จำนวนบรรทัดในสูตรชุดของรหัสนี้ (0 = ไม่อยู่ในทะเบียนชุด)
 */
export function ป้ายเหตุจับคู่ไม่ได้(จำนวนชิ้นส่วน) {
  const n = Number(จำนวนชิ้นส่วน) || 0;
  if (n > 1) {
    return {
      kind: "bundle_multi_part",
      parts: n,
      why: `อยู่ในทะเบียนชุด (${n} ชิ้นส่วน) — คลังรู้จัก แต่ตัวเทียบนี้คิดจำนวนจากสูตรหลายชิ้นไม่ได้`,
    };
  }
  return { kind: "not_in_warehouse", why: "คลังไม่รู้จักรหัสนี้เลย (ทั้งทะเบียนสินค้าและทะเบียนชุด)" };
}

/** ตัดสินว่า "อ่านสต็อกไม่ได้ทุกแถว" หรือไม่ — คืนข้อความเหตุผล หรือ `null` ถ้าเดินต่อได้
 *
 *  🔑 แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพื่อ **ทดสอบคำตัดสินได้โดยไม่ต้องยิงเน็ต/ฐานข้อมูล**
 *     และเพื่อให้เหตุผลอยู่ที่เดียว (ตัวเก็บของแค่นับ ไม่ตัดสิน)
 *  🔴 สามสถานะ ห้ามยุบเป็นสอง:
 *     · `undefined`/`null` = **ตัวเก็บของรุ่นเก่าไม่ได้ส่งตัวนับมา ⇒ ไม่รู้ ⇒ ไม่ตัดสิน**
 *       (ถ้าแปลว่า "อ่านได้ทุกแถว" ด่านจะเงียบในวันที่ควรดังที่สุด — วันที่ deploy ยังไม่ขึ้น)
 *     · ตัวเลข = รู้จริง ⇒ ตัดสินได้
 *  🔑 ผูกกับ "อ่านค่าไม่ได้" ไม่ใช่ "ค่าเป็น 0" ⇒ ของหมดจริงทั้งร้าน ด่านต้องเงียบ */
export function ตัดสินสต็อกอ่านไม่ได้(จำนวนแถว, ตัวนับอ่านไม่ได้) {
  if (ตัวนับอ่านไม่ได้ === undefined || ตัวนับอ่านไม่ได้ === null) return null;
  const n = Number(ตัวนับอ่านไม่ได้);
  if (!Number.isFinite(n)) return null;
  if (!(จำนวนแถว > 0) || n !== จำนวนแถว) return null;
  return (
    `Shopee ส่งสินค้ามา ${จำนวนแถว} แถว แต่ **อ่านช่องสต็อกไม่ได้เลยสักแถว** ` +
    "(เส้นทาง stock_info_v2.seller_stock[0].stock ไม่มีอยู่) ⇒ น่าจะเปลี่ยนรูปคำตอบ " +
    "⇒ หยุดไว้ก่อน ไม่คิดแผนดันสต็อกจากสต็อกศูนย์ — ต้องแก้เส้นทางใน shopee-stock.mjs ให้ตรงก่อน"
  );
}

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
    ).catch((e) => {
      /* 🔴 **แยก "ไม่มีตารางสูตร" (ปกติ) ออกจาก "ถามไม่ได้" (ผิดปกติ)** (แก้ 6 ก.ย. 2569)
          เดิมกลืนเป็น `[]` ทั้งสองกรณี ⇒ D1 สะดุดชั่วคราว ⇒ สูตรชุดหายทั้งกอง
          ⇒ โซ่ตัดขาย/ชุด KINGKONG ตกไปเป็น "คลังไม่รู้จัก" ⇒ Telegram รายวันส่งว่า
            "คลังไม่รู้จัก 148 จาก 1,926 รหัสที่ลงขายอยู่" **ทั้งที่คลังรู้จักครบ**
          และตัวตรวจตัวเองของไฟล์ฝั่ง TikTok (`bucketsAddUp`) ยังเป็น true ⇒ ไม่มีอะไรฟ้อง
          🔴 **แก้ข้อความ 11 ก.ย. 2569 — ไฟล์นี้ไม่เคยมี `bucketsAddUp` เลย**
             ข้อความเดิมเขียนเหมือนไฟล์นี้มีตาข่ายตัวนั้นอยู่ ⇒ คนอ่านจะเชื่อว่ามีคนเฝ้าอยู่
             ซึ่ง**อันตรายกว่าการไม่มีตาข่ายเฉย ๆ** (ตาข่ายในจินตนาการทำให้ไม่มีใครไปสร้างของจริง)
             ตอนนี้ไฟล์นี้มี `sawAllItems` แทน ซึ่งเทียบกับยอดที่ Shopee ประกาศ (นอกกอง)
             แต่ **มันตรวจแค่ "ไล่หน้าครบไหม" ไม่ได้ตรวจว่าทุกแถวตกกองครบ**
             ของหลังนั้นตรวจที่ stock-push.mjs:139 ซึ่งใช้ platformSkus เป็นตัวหาร
          ⇒ ไม่มีตาราง = ถอยไปวิธีเดิมเงียบ ๆ ได้ · ถามไม่ได้ = **ต้องติดธงไปกับผล** */
      const msg = String(e?.message || e);
      return /no such table/i.test(msg) ? [] : { __err: msg.slice(0, 160) };
    }),
  ]);
  /* 🔴 **ได้ 0 รายการจาก Shopee = หยุด ห้ามเดินต่อด้วยกองว่าง** (เพิ่ม 11 ก.ย. 2569)
      รูเดียวกับฝั่ง Lazada เป๊ะ: ตัวดึงคืนกองว่างได้โดยไม่มี error (payload ไม่มี item /
      รูปแบบเปลี่ยน) ⇒ เดินต่อจะได้ผล "ศูนย์ครบทุกช่อง" ซึ่งอ่านเหมือนทุกอย่างตรงกันดี
      ⚠️ ศูนย์อันตรายกว่าว่างเปล่า เพราะว่างทำให้คนสงสัย แต่ศูนย์ทำให้คนสบายใจ
      ⚠️ แยก "อ่านไม่ได้" ออกจาก "ร้านไม่มีของลงขาย" ด้วยยอดที่แพลตฟอร์มประกาศ ·
         ไม่ได้ประกาศมา = **แยกไม่ได้ ⇒ เขียนตรง ๆ** ห้ามเดาแทนคนอ่าน */
  if (!rows.length) {
    const dec = rows.coverage?.declared
    const why = Number.isFinite(dec) && dec > 0
      ? `Shopee บอกว่ามี ${dec} สินค้า แต่เราอ่านมาได้ 0 ⇒ อ่านรายการสินค้าไม่สำเร็จ`
      : Number.isFinite(dec) && dec === 0
        ? "Shopee บอกเองว่าไม่มีสินค้าลงขายอยู่เลย (ไม่ใช่เราอ่านไม่ได้)"
        : "อ่านรายการสินค้าบน Shopee ได้ 0 รายการ และแพลตฟอร์มไม่ได้บอกยอดรวมมา "
          + "⇒ **แยกไม่ได้ว่าอ่านไม่สำเร็จ หรือร้านไม่มีของลงขายจริง**";
    return { skip: why, shopeeRows: 0, declaredOnPlatform: Number.isFinite(dec) ? dec : null };
  }

  /* 🔴 **มีแถวมา แต่อ่านสต็อกไม่ได้ทุกแถว = เส้นทางในคำตอบเปลี่ยน ห้ามคิดแผนดัน** (19 ก.ย. 2569)
      เส้นทางที่ใช้อ่านลึกสี่ชั้น `m.stock_info_v2.seller_stock[0].stock`
      — เลข **v2** ในชื่อคือหลักฐานว่า Shopee เคยเปลี่ยนชื่อชั้นมาแล้วจริง ๆ
      ถ้าเปลี่ยนอีก: ทุกแถวอ่านได้ `null` ⇒ ของเดิมแปลงเป็น **0** ⇒ "Shopee ไม่มีของทั้งร้าน"
      ⇒ **แผนดันสต็อกจะสั่งดันทั้ง 1,870 รหัส** ซึ่งเป็นค่าที่ **ออกไปแตะของจริงบนมาร์เก็ตเพลส**
      ⇒ ด่านนี้จึงต้องอยู่**ก่อน**การคิดแผน ไม่ใช่ไปเตือนทีหลัง
      🔑 ผูกกับ "อ่านค่าไม่ได้" ไม่ใช่ "ค่าเป็น 0" ⇒ วันที่ของหมดจริงทั้งร้าน ด่านนี้เงียบ
      🚫 ไม่ตั้งเพดานเป็นสัดส่วน — ยังไม่ได้วัดว่าปกติมีกี่แถวที่อ่านไม่ได้ (บางสินค้ามีตัวเลือก
         แต่อ่าน model ไม่ได้ = ไม่รู้สต็อกจริง ๆ) ⇒ รอบนี้หยุดเฉพาะกรณี **ทุกแถว** ซึ่งแน่นอน
         และ **รายงานตัวเลขออกไปทุกรอบ** เพื่อให้มีค่าจริงไปตั้งเพดานทีหลัง */
  const หยุดเพราะอ่านสต็อกไม่ได้ = ตัดสินสต็อกอ่านไม่ได้(rows.length, rows.qtyUnreadable);
  if (หยุดเพราะอ่านสต็อกไม่ได้) {
    return {
      skip: หยุดเพราะอ่านสต็อกไม่ได้,
      shopeeRows: rows.length,
      qtyUnreadable: Number(rows.qtyUnreadable),
    };
  }

  /* ถามสูตรชุดไม่ได้ = ต้องบอกออกไป ห้ามให้ผลดูเหมือนตรวจครบ */
  const recipeErr = rec && !Array.isArray(rec) ? rec.__err : null;
  const recRows = Array.isArray(rec) ? rec : [];
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
  /* 🔴 **ชุดหลายชิ้นถูกข้ามที่นี่ แล้วไปตกกอง "คลังไม่รู้จักรหัสนี้" ซึ่งเป็นป้ายที่ผิด**
     (ฝั่งจอจับได้ 19 ก.ย. 2569: 11 รหัสใน 26 รหัสกอง `unknown` **อยู่ในทะเบียนชุด 360 รหัสตรงตัว**
      เช่น `00073-11.8-KK` · `00277 set ลูกสูบ`)
     🔑 คลังรู้จักมันดี — ที่ทำไม่ได้คือ **ตัวเทียบนี้คิดจำนวนจากสูตรหลายชิ้นไม่ได้**
        สองอย่างนี้คนละเรื่อง และป้ายที่ผิดพาคนไปทำงานผิด
        (ใบงานเกือบกลายเป็น "ไปจัดระเบียบรายการที่ลงขาย" ทั้งที่ของถูกจดทะเบียนไว้แล้ว)
     ⇒ แยกกองให้ชัด: `ชุดหลายชิ้น` ⇒ ติดป้าย `kind` ไปกับตัวอย่าง ให้ปลายทางเขียนคำที่ถูก
     ⏳ **ยังไม่คิดจำนวนให้มันในรอบนี้โดยตั้งใจ** — คิดได้ (min ของ floor(ชิ้นส่วน/ต่อหน่วย))
        และมีโค้ดอยู่แล้วใน `summarizeUnlisted` ไฟล์เดียวกัน
        แต่ทำแล้วรหัสกลุ่มนี้จะ **เข้าแผนดันสต็อกทันที** ⇒ เปลี่ยนเลขบนหน้าร้าน Lazada ที่เปิดยิงจริงอยู่
        ⇒ เป็นการตัดสินใจของท่านประธาน ไม่ใช่ผลข้างเคียงของการแก้ป้าย */
  const นับชิ้นส่วน = new Map();
  for (const r of recRows) นับชิ้นส่วน.set(String(r.sku).trim(), (นับชิ้นส่วน.get(String(r.sku).trim()) || 0) + 1);
  {
    for (const r of recRows) {
      const k = String(r.sku).trim();
      if (นับชิ้นส่วน.get(k) !== 1) continue; // ชุดหลายชิ้นคิดแบบนี้ไม่ได้ — ดูคอมเมนต์ข้างบน
      const per = num(r.per);
      if (per > 0 && r.base) recipe.set(k, { base: String(r.base).trim(), per });
    }
  }

  const diff = [];
  const missingSample = [];
  let same = 0;
  let missing = 0;
  let missingBundleMultiPart = 0;   // ในกอง missing มีกี่รหัสที่จริง ๆ คลังรู้จัก (ชุดหลายชิ้น)
  let viaRecipe = 0;
  for (const r of withSku) {
    // ชุดก่อน — ระบุตัวได้ตรงตัวจากสูตร แล้วคิดจำนวนจากม้วนแม่จริง
    const rec = recipe.get(r.sku);
    if (rec && snap.has(rec.base)) {
      viaRecipe += 1;
      const ours = Math.floor(num(snap.get(rec.base)) / rec.per);
      if (ours === r.qty) same += 1;
      else diff.push({ sku: r.sku, name: r.name, shopee: r.qty, core: ours, directQty: snap.get(r.sku) ?? null, gap: ours - r.qty, via: "สูตรชุด" });
      continue;
    }
    if (!snap.has(r.sku)) {
      missing += 1;
      /* 🏷️ **ป้ายว่าทำไมจับคู่ไม่ได้ — คนละเหตุ คนละงาน คนละคนแก้** (เพิ่ม 19 ก.ย. 2569)
         `bundle_multi_part` = คลัง**รู้จัก**รหัสนี้ในทะเบียนชุด แต่เป็นชุดหลายชิ้น
            ⇒ ตัวเทียบนี้คิดจำนวนไม่ได้ ⇒ **ห้ามเขียนว่า "คลังไม่รู้จัก"**
         `not_in_warehouse` = ไม่รู้จักจริง ⇒ ต้องจัดระเบียบรายการที่ลงขาย หรือสร้างสินค้า/ชุด
         🔑 ป้ายที่ผิดพาคนไปทำงานผิด — ของจริง 11 จาก 26 รหัสถูกติดป้ายผิดอยู่ 2 วัน */
      const ป้าย = ป้ายเหตุจับคู่ไม่ได้(นับชิ้นส่วน.get(String(r.sku).trim()) || 0);
      if (ป้าย.kind === "bundle_multi_part") missingBundleMultiPart += 1;
      // ต้องเห็นตัวอย่างด้วย ไม่งั้นบอกไม่ได้ว่าเป็นสินค้าที่ไม่มีใน ZORT
      // หรือเป็นแค่ชื่อ SKU เขียนคนละแบบ (ตัวพิมพ์ · ขีด · เว้นวรรค)
      /* 🔴 **ขอ full ต้องได้รายชื่อครบ** (แก้ 19 ก.ย. 2569 · ฝั่งจอจับได้)
         ของเดิมตัดที่ 20 **ทุกกรณี** ⇒ ตัวนับบอก 31 แต่รายชื่อมี 26 ⇒ มี 5 รหัสที่นับแล้วไม่มีชื่อ
         ⇒ จอขึ้นคำเตือน "มีเลขแต่ไม่มีรายการ" แล้ว **ไล่ต่อไม่ได้ว่า 5 ตัวนั้นอยู่กองไหน**
         🔑 คลาส: **เลขเพื่อการแสดงผลถูกเอาไปตัดสินใจ** — ตัวนับมาจาก `missing`
            แต่รายชื่อมาจากตัวอย่างที่ถูกตัด ⇒ สองค่ามาจากคนละที่โดยไม่มีใครประกาศ
         📌 `lazada.mjs` แก้ข้อนี้ไปแล้วตั้งแต่ก่อน (`o.full || …`) — เหลือ shopee กับ tiktok
            ⇒ ของจริงคือ **แก้ไปแล้ว 1 จาก 3 เจ้า** แล้วไม่มีใครรู้ว่าอีกสองเจ้ายังไม่แก้ */
      if (o.full || missingSample.length < 20) missingSample.push({ sku: r.sku, name: r.name, ...ป้าย });
      continue;
    }
    const ours = snap.get(r.sku);
    if (ours === r.qty) same += 1;
    else diff.push({ sku: r.sku, name: r.name, shopee: r.qty, core: ours, directQty: ours, gap: ours - r.qty });
  }
  diff.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  return {
    day,
    snapshotRows: snap.size, // คลังเรารู้จักกี่ SKU ในวันนั้น — ตัวหารของเรื่องนี้
    shopeeRows: rows.length,
    shopeeSkus: withSku.length,
    noSku: rows.length - withSku.length,
    same,
    /* 🔴 ในกอง `missing` มีกี่รหัสที่ **คลังรู้จักแต่คิดจำนวนไม่ได้** (ชุดหลายชิ้น)
       ⇒ ปลายทางต้องเขียนคำให้ตรง: ไม่ใช่ "คลังไม่รู้จัก" แต่เป็น "คิดจำนวนจากสูตรหลายชิ้นไม่ได้" */
    missingBundleMultiPart,
    missingNotInWarehouse: missing - missingBundleMultiPart,
    /* 📏 ประกาศว่า **รายชื่อครบหรือถูกตัด** — ห้ามให้ปลายทางเดาจากการนับความยาว
       (ตัวนับ `missing` กับความยาว `missingSample` มาจากคนละที่ ⇒ ไม่เท่ากันได้โดยไม่ใช่บั๊ก) */
    missingSampleครบ: Boolean(o.full) || missingSample.length >= missing,
    missingSampleเพดาน: o.full ? null : 20,
    // จับคู่ได้เพราะมีสูตรชุด (ไม่ใช่การเดา) — เดิมตกอยู่ในกอง "คลังไม่รู้จัก" ทั้งหมด
    matchedByRecipe: viaRecipe,
    bundlesWithRecipe: recipe.size,
    missing,
    missingSample,
    negativeInCore: [...snap.values()].filter((v) => v < 0).length,
    /* ⚠️ ถามตารางสูตรชุดไม่ได้ ⇒ กอง "คลังไม่รู้จัก" สูงเกินจริง (สินค้าชุดตกมากองนี้หมด)
        **ห้ามอ่านตัวเลขนั้นเป็น "ของหาย"** · null = ถามได้ปกติ */
    recipeError: recipeErr,
    diffCount: diff.length,
    /* ⚠️ `diff` ถูกตัดที่ 50 **เพื่อการแสดงผลเท่านั้น** — ตัวจริงอยู่ใน diffCount
        ใครจะเอาไป "คิดต่อ" (เช่นแผนดันสต็อก) ต้องขอ full:1 ไม่งั้นจะคิดจากตัวอย่าง
        แล้วของหายเงียบ ๆ (เจอจริง 5 ก.ย. 2569 ดึก — แผนดันขาดไป 5 รหัสโดยไม่มีอะไรฟ้อง
        เป็นกับดัก "ตัวอย่างไม่ใช่ตัวแทน" ตัวที่ 6 ของวันเดียวกัน) */
    diff: o.full ? diff : diff.slice(0, 50),
    diffTruncated: !o.full && diff.length > 50,
    /* ✅ ตาข่ายจริง — **ตัวหารมาจากนอกกอง** (ยอดสินค้าที่ Shopee ประกาศเอง)
        true = ไล่หน้ารายการสินค้าครบ · false = ไม่ครบ ⇒ ทุกตัวนับข้างบนต่ำกว่าจริง **ห้ามใช้ต่อ**
        null = Shopee ไม่ได้บอกยอดรวมมา ⇒ ยังไม่ได้ตรวจ (ไม่ใช่ผ่าน)
        ⚠️ ตรวจแค่ "ไล่หน้าครบไหม" ไม่ได้ตรวจว่าทุกแถวตกกองครบ (อันนั้นอยู่ที่ stock-push.mjs:139) */
    sawAllItems: rows.coverage?.sawAll ?? null,
    itemsSeen: rows.coverage?.ids?.length ?? null,
    shopeeItemTotal: rows.coverage?.declared ?? null,
    /* 📍 ที่อยู่บน Shopee ของแต่ละรหัส (เฉพาะ full — ตัวยิงใช้) · รหัสเดียวอยู่หลายที่ได้ ⇒ เป็นรายการ
       ⚠️ ตัวยิงต้องปฏิเสธรหัสที่มี >1 ที่อยู่ — ดันเลขเต็มทุกที่ = ขายเกินของ */
    ...(o.full ? { locations: ที่อยู่ของรหัส(withSku, (r) => ({ itemId: r.itemId ?? null, modelId: r.modelId ?? null })) } : {}),
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

