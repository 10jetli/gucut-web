// จับคู่ "รหัสบนแพลตฟอร์ม" กับ "รหัสในคลังเรา" — ที่เดียวสำหรับทุกจอ
//
// แพลตฟอร์มขายเป็นระดับ **ตัวเลือก** (`00369-25T` · `00073-11.8-KK` · `00817-roll`)
// ⇒ ถ้าคลังเรามีแต่ **รหัสฐาน** (`00369`) ต้องตัดท้ายทีละขีดแล้วเทียบ
//
// 🔴 **แต่ "คลังเราเก็บแต่รหัสฐาน" ไม่จริงเสมอไป** (ท่านประธานชี้เอง 18 ก.ย. 2569)
//    ท่านทักว่า `00073` ยังขึ้นจุดส้ม "จับคู่จากการเดารหัสฐาน" ทั้งที่ไม่ควรเดา
//    ยิงตรวจของจริง: คลังเรามี **รหัสชุด 16 รหัส** ใต้ `00073-*` (ตาราง `bundles`)
//    และ 3 ใน 4 รหัสที่ Shopee ใช้ (`00073-OnlyMachine` · `00073-11.8-NW` · `00073-11.8-KK`)
//    **ตรงเป๊ะกับรหัสชุดของเรา** — ไม่มีอะไรต้องเดาเลยสักตัว
//    เหลือ `00073KK` (ไม่มีขีด) ตัวเดียวที่ไม่มีในคลังจริง ⇒ ตัวนั้นถึงควรเตือน
//
// 🔑 **การเดาคือการเดา ก็ต่อเมื่อไม่มีใครอ้างสิทธิ์รหัสนั้นแบบตรงตัว**
//    รหัสบนแพลตฟอร์มที่ตรงกับรหัสของเราอยู่แล้ว (สินค้า **หรือ** ชุด)
//    มี "บ้านของตัวเอง" ⇒ ห้ามเอาไปแปะเป็นการเดาให้รหัสฐาน
//    ไม่งั้นจอจะเตือนเรื่องที่ไม่มีปัญหา แล้วคนจะเลิกเชื่อจุดส้มทั้งหมด
//    รวมถึงตัวที่มีปัญหาจริง — เตือนผิดแพงกว่าไม่เตือน
//
// ⚠️ **การตัดท้ายคือการเดา ไม่ใช่ความจริง** — เดาผิด = ไปนับเป็นสต็อกของสินค้าตัวอื่น
//    วัดจริง 4 ก.ย. 2569 (Lazada): ตรงตัว 1,634 · เดา 26 = 1% และ 26 ตัวนั้น
//    ชื่อสินค้ายืนยันว่าเดาถูก (ท้ายรหัสคือความยาวโซ่/ขนาดบาร์/แบบม้วน)
//
// ⚠️ **ต้องอยู่ไฟล์เดียว ห้ามก๊อปตรรกะไปวางซ้ำ** — เดิมมีสองชุด (channel-compare กับ
//    core-stock) แล้ว **ชุดหนึ่งมีเพดานความยาว อีกชุดไม่มี** ⇒ สองจอตอบไม่ตรงกัน
//    เรื่องเดียวกันได้โดยไม่มีอะไรฟ้อง (เจอ 4 ก.ย. 2569 ตอนฝั่งจอไล่ถาม)
//
// ⚠️ **ตรงตัวชนะการเดาเสมอ** — รหัสที่เข้าได้ทั้งสองทางนับเป็น exact

/** ห้ามตัดจนสั้นกว่านี้ — เศษสั้น ๆ อย่าง `SET` `A` ชนรหัสจริงได้ง่ายมาก */
export const MIN_BASE = 4;

/** `00369-25T` → [`00369-25T`, `00369`] (ตัวเต็มมาก่อนเสมอ) */
export function expandSku(code) {
  const out = [code];
  let b = code;
  while (b.includes("-")) {
    b = b.slice(0, b.lastIndexOf("-"));
    if (b.length >= MIN_BASE) out.push(b);
  }
  return out;
}

/**
 * สร้างตารางค้นจากรายการที่ลงขายบนแพลตฟอร์ม
 * @param {Record<string,string[]>} listings รหัสเต็มบนแพลตฟอร์ม → รายชื่อช่องทาง
 * @param {{ownSkus?: Iterable<string>, bundleSkus?: Iterable<string>}} [opts]
 *   ownSkus    = รหัสที่ **คลังเรามีจริง** (สินค้า + ชุด)
 *   bundleSkus = เฉพาะ **รหัสชุด** — ต้องแยกออกมา เพราะชุดไม่มีแถวของตัวเองในจอสินค้า
 *                ⇒ ถ้าไม่บอก แถวรหัสฐานจะกลายเป็น "ไม่ได้ขายที่ไหนเลย" ซึ่งโกหก
 *   ⚠️ ไม่ส่งมา = ทำงานแบบเดิมทุกประการ (ของเก่าไม่พัง) แต่จะเดาเกินจริง
 *      ⇒ คนเรียกควรส่งเสมอ · ที่ไม่บังคับเพราะบางจอยังไม่มีรายชื่อชุดในมือ
 * @returns {{ tagsOf(sku):string[], methodOf(sku):Record<string,"exact"|"base">,
 *             fromOf(sku):Record<string,string[]> }}
 */
export function buildSkuIndex(listings = {}, opts = {}) {
  const มีบ้านอยู่แล้ว = new Set(opts.ownSkus || []);
  const เป็นรหัสชุด = new Set(opts.bundleSkus || []);
  const exact = new Map();  // sku → Set(tag)
  const base = new Map();   // sku → Map(tag → [รหัสเต็มที่ตัดมา]) — **การเดา**
  const bundle = new Map(); // sku → Map(tag → [รหัสชุดของเราเอง]) — **ไม่ใช่การเดา**

  for (const [code, tags] of Object.entries(listings)) {
    const e = exact.get(code) || new Set();
    for (const t of tags) e.add(t);
    exact.set(code, e);
  }
  for (const [code, tags] of Object.entries(listings)) {
    /* 🔴 **สามทาง ไม่ใช่สองทาง** (แก้ 19 ก.ย. 2569 — เห็นจากจอจริงของท่านประธาน)
       รอบแรกผมแค่ `continue` ข้ามรหัสที่เรามีอยู่แล้ว ⇒ จุดส้มหายจริง
       **แต่แถวรหัสฐานกลายเป็นขีด "ไม่ได้ขายที่ไหนเลย"** ทั้งที่ขายอยู่บน Shopee/TikTok
       ⇒ เอาคำเตือนที่ผิดออก แล้วได้ความเงียบที่ผิดแทน ซึ่งแย่กว่า
          (หัวไฟล์ marketplace-listings เตือนเรื่องนี้ไว้แล้วตั้งแต่ 4 ก.ย. — ผมเดินเข้าไปเอง)

       ① รหัสชุดของเราเอง  → ผูกกับรหัสฐานแบบ "bundle" = ขายจริง ไม่ใช่การเดา
       ② รหัสสินค้าของเราเอง → ข้าม มันมีแถวของตัวเองในจอ
       ③ รหัสที่เราไม่มี     → "base" = เดา ต้องเตือน */
    if (เป็นรหัสชุด.has(code)) {
      for (const k of expandSku(code)) {
        if (k === code || !มีบ้านอยู่แล้ว.has(k)) continue;
        const m = bundle.get(k) || new Map();
        for (const t of tags) {
          const arr = m.get(t) || [];
          if (!arr.includes(code)) arr.push(code);
          m.set(t, arr);
        }
        bundle.set(k, m);
        break;   // ผูกกับรหัสฐานที่ใกล้ที่สุดตัวเดียวพอ
      }
      continue;
    }
    if (มีบ้านอยู่แล้ว.has(code)) continue;
    for (const k of expandSku(code)) {
      if (k === code) continue;
      const ex = exact.get(k);
      const m = base.get(k) || new Map();
      for (const t of tags) {
        if (ex?.has(t)) continue; // ตรงตัวมีแล้วสำหรับช่องทางนี้ ⇒ ไม่ใช่การเดา
        const arr = m.get(t) || [];
        if (!arr.includes(code)) arr.push(code);
        m.set(t, arr);
      }
      if (m.size) base.set(k, m);
    }
  }

  return {
    tagsOf(sku) {
      const s = new Set(exact.get(sku) || []);
      for (const t of (bundle.get(sku) || new Map()).keys()) s.add(t);
      for (const t of (base.get(sku) || new Map()).keys()) s.add(t);
      return [...s];
    },
    /** ช่องทาง → จับคู่ได้ยังไง
     *  "exact"  = รหัสตรงตัว
     *  "bundle" = ขายผ่าน **รหัสชุดของเราเอง** — แน่นอนพอ ๆ กับตรงตัว ⚠️ ห้ามแสดงเป็นคำเตือน
     *  "base"   = เดาจากการตัดท้าย — อันนี้เท่านั้นที่ควรขึ้นจุดส้ม
     *  ⚠️ ลำดับสำคัญ: ตรงตัว > ชุด > เดา (ของที่แน่นอนกว่าชนะเสมอ) */
    methodOf(sku) {
      const out = {};
      for (const t of exact.get(sku) || []) out[t] = "exact";
      for (const t of (bundle.get(sku) || new Map()).keys()) if (!out[t]) out[t] = "bundle";
      for (const t of (base.get(sku) || new Map()).keys()) if (!out[t]) out[t] = "base";
      return out;
    },
    /** ช่องทาง → รหัสชุดของเราที่ขายอยู่บนช่องทางนั้น (ไว้โชว์ในทูลทิปแบบไม่ใช่คำเตือน) */
    bundlesOf(sku, cap = 50) {
      const out = {};
      for (const [t, arr] of bundle.get(sku) || new Map()) out[t] = arr.slice(0, cap);
      return out;
    },
    /** ช่องทาง → รหัสเต็มบนแพลตฟอร์มที่ถูกตัดมาเป็นรหัสนี้ (เฉพาะที่เดา) */
    fromOf(sku, cap = 50) {
      /* 🔴 **เพดานนี้เคยเป็น 5 และ "เลขเพื่อการแสดงผล" ถูกเอาไปใช้ตัดสิน** (18 ก.ย. 2569)
         ตอนกวาดทั้งคลังเพื่อตอบท่านประธานว่า "จุดส้มกี่แถวไม่ควรส้ม"
         พบว่ามี **38 แถวชนเพดาน 5 พอดี** ⇒ รหัสที่เกินถูกตัดทิ้งเงียบ ๆ
         ⇒ ตัวเลขที่ได้เป็น "อย่างน้อย" ไม่ใช่ค่าจริง แต่หน้าตาเหมือนค่าจริงทุกประการ
         (กฎ display-limits-cant-decide) */
      const out = {};
      for (const [t, arr] of base.get(sku) || new Map()) out[t] = arr.slice(0, cap);
      return out;
    },
    /** จำนวนรหัสจริงต่อช่องทาง (ไม่ถูกตัด) — ให้คนอ่านรู้ว่าที่เห็นครบหรือไม่ */
    countFrom(sku) {
      const out = {};
      for (const [t, arr] of base.get(sku) || new Map()) out[t] = arr.length;
      return out;
    },
  };
}

/** รหัสที่ **คลังเรามีจริง** — สินค้า (`products`) + ชุด (`bundles`)
 *
 * 🔴 ต้องรวมชุดด้วยเสมอ (ท่านประธานชี้ 18 ก.ย. 2569)
 *    วัดจริงวันนั้น: ชุด 360 รหัส · แถวที่ขึ้นจุดส้ม 34 แถว
 *    ในนั้น **26 แถว (76%) ไม่ควรส้มเลย** เพราะรหัสบนแพลตฟอร์มตรงกับชุดของเราเป๊ะ
 *    ⇒ เตือนเรื่องที่ไม่มีปัญหา 3 ใน 4 ของทั้งหมด = คนเลิกเชื่อจุดส้ม
 *      แล้ว 8 แถวที่มีปัญหาจริงจะถูกมองข้ามไปด้วย
 *
 * ⚠️ อ่านไม่ได้ให้คืนเซ็ตว่าง (= ทำงานแบบเดิม เดาเกินจริงบ้าง)
 *    **ห้ามโยน error** — จอสินค้าทั้งจอต้องไม่ล้มเพราะเรื่องป้ายกำกับ
 */
export async function ourSkuSet(coreQuery) {
  const { all } = await ourSkus(coreQuery);
  return all;
}

/** แยกให้ชัดว่าอันไหนเป็นสินค้า อันไหนเป็นชุด
 *  🔑 ต้องแยก เพราะ **ชุดไม่มีแถวของตัวเองในจอสินค้า**
 *     รหัสชุดที่ขายบนแพลตฟอร์มจึงต้องไปเกาะแถวรหัสฐาน ไม่งั้นแถวนั้นจะดูเหมือนไม่ได้ขายเลย */
export async function ourSkus(coreQuery) {
  const products = new Set();
  const bundles = new Set();
  for (const [sql, set] of [["SELECT sku FROM products", products],
                            ["SELECT sku FROM bundles", bundles]]) {
    try {
      for (const r of (await coreQuery(sql)) || []) if (r?.sku) set.add(String(r.sku));
    } catch {
      /* ตารางยังไม่มี/อ่านไม่ได้ = ข้ามตารางนั้น ไม่ล้มทั้งงาน */
    }
  }
  return { products, bundles, all: new Set([...products, ...bundles]) };
}
