// จับคู่ "รหัสบนแพลตฟอร์ม" กับ "รหัสในคลังเรา" — ที่เดียวสำหรับทุกจอ
//
// แพลตฟอร์มขายเป็นระดับ **ตัวเลือก** (`00369-25T` · `00073-11.8-KK` · `00817-roll`)
// คลังเราเก็บ **รหัสฐาน** (`00369`) ⇒ ต้องตัดท้ายทีละขีดแล้วเทียบ
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
 * @returns {{ tagsOf(sku):string[], methodOf(sku):Record<string,"exact"|"base">,
 *             fromOf(sku):Record<string,string[]> }}
 */
export function buildSkuIndex(listings = {}) {
  const exact = new Map(); // sku → Set(tag)
  const base = new Map(); // sku → Map(tag → [รหัสเต็มที่ตัดมา])

  for (const [code, tags] of Object.entries(listings)) {
    const e = exact.get(code) || new Set();
    for (const t of tags) e.add(t);
    exact.set(code, e);
  }
  for (const [code, tags] of Object.entries(listings)) {
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
      for (const t of (base.get(sku) || new Map()).keys()) s.add(t);
      return [...s];
    },
    /** ช่องทาง → จับคู่ได้ยังไง ("exact" = ชื่อตรงตัว · "base" = เดาจากการตัดท้าย) */
    methodOf(sku) {
      const out = {};
      for (const t of exact.get(sku) || []) out[t] = "exact";
      for (const t of (base.get(sku) || new Map()).keys()) if (!out[t]) out[t] = "base";
      return out;
    },
    /** ช่องทาง → รหัสเต็มบนแพลตฟอร์มที่ถูกตัดมาเป็นรหัสนี้ (เฉพาะที่เดา) */
    fromOf(sku) {
      const out = {};
      for (const [t, arr] of base.get(sku) || new Map()) out[t] = arr.slice(0, 5);
      return out;
    },
  };
}
