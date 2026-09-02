// ขายหน้าร้าน (POS) เข้าคลังเงาโดยตรง — ไม่ผ่าน ZORT
//
// ทำไมต้องมีก่อนเรื่องอื่น: วัดแล้ว **POS = 271 ใบจาก 817 ใบใน 30 วัน (฿153,530)**
// หนึ่งในสามของออเดอร์ทั้งร้าน · ทุกวันนี้เข้าคลังเงาผ่านกระจก ZORT เท่านั้น
// ⇒ ตัด ZORT วันไหน ยอดขายหน้าร้านหายจากระบบเราทันที และคลังจะเพี้ยนทุกวัน
// ท่อนี้จำเป็น **ไม่ว่าเจ้าของร้านจะเลือกสร้าง POS เองหรือเก็บ ZORT ตัวเล็กไว้คิดเงิน**
//
// ⚠️ **ห้ามเขียน stock_moves ให้ใบขาย** — ตัวคิดสต็อกหักของที่ขายจาก `order_items` อยู่แล้ว
//    (สูตร: วันฐาน − ที่ขายไป + ที่ปรับมือ) เขียนทั้งสองที่ = ตัดสต็อกสองรอบแบบเงียบ ๆ
// ⚠️ **ยกเลิกใบ = เปลี่ยนสถานะเป็น Voided ไม่ใช่ลบทิ้ง** บัญชีขายต้องตามรอยได้
//    และตัวเทียบยอดกับ ZORT อ่านสถานะเพื่อคัดใบยกเลิกออกอยู่แล้ว
// ⚠️ ระหว่างที่ยังใช้ ZORT อยู่ **ห้ามยิงท่อนี้คู่กับการเปิดบิลใน ZORT ใบเดียวกัน**
//    จะกลายเป็นสองใบในคลังเงา — ท่อนี้มีไว้ใช้ "หลัง" ตัด ZORT หรือใช้กับสาขาที่ไม่ได้ใช้ ZORT
import { coreQuery, coreReady } from "./coredb.mjs";

const esc = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const thaiToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

// วิธีชำระเงินที่รับได้ — จำกัดไว้เท่าที่เครื่องคิดเงินจริงมี (เงินสด · บัตร · โอน)
// ⚠️ จำเป็นกับการปิดยอดสิ้นวัน: เงินสดต้องนับในลิ้นชัก · โอนต้องเช็คสลิป ·
//    บัตรต้องกระทบยอดกับเครื่องรูด — รวมเป็นก้อนเดียวแล้วแยกไม่ออกอีกเลย
export const PAY_METHODS = { cash: "เงินสด", credit: "บัตรเครดิต", transfer: "โอนเงิน" };

export const POS_SOURCE = "pos";
export const POS_CHANNEL = "POS หน้าร้าน";

// สาขาหน้าร้านจริงของร้าน — ตรงกับ "คลัง" ในร้าน ZORT ตัวที่สอง (ZAMA)
// ⚠️ กระจกจาก ZORT รวมสองสาขาเป็นช่องทาง "POS" ก้อนเดียว แยกไม่ได้
//    ของเราแยกตั้งแต่ต้นทางเป็น "POS KLD" / "POS ANJ" ⇒ รายงานรายสาขาได้เองโดยไม่ต้องทำอะไรเพิ่ม
//    (จอที่จัดกลุ่มตาม channel อยู่แล้วจะเห็นสาขาแยกทันที)
// ⚠️ ตั้งชื่อสาขาเพิ่มด้วย env POS_BRANCHES = "KLD:ชื่อเต็ม,ANJ:ชื่อเต็ม" ไม่ต้องแก้โค้ด
export function branches() {
  const raw = String(process.env.POS_BRANCHES ?? "").trim();
  if (raw) {
    return raw
      .split(",")
      .map((x) => x.split(":"))
      .filter((x) => x[0]?.trim())
      .map((x) => ({ code: x[0].trim().toUpperCase(), name: (x[1] ?? x[0]).trim() }));
  }
  return [
    { code: "KLD", name: "สาขา KLD" },
    { code: "ANJ", name: "สาขา ANJ" },
  ];
}

/** เลขที่ใบถัดไปของวัน — POS-YYYYMMDD-001
 *  ⚠️ นับจากใบที่มีอยู่จริงในฐาน ไม่เก็บตัวนับแยก — ตัวนับแยกจะเพี้ยนทันทีที่มีใบถูกยกเลิก
 *     หรือมีคนเขียนตรง ๆ เข้าฐาน · ชนกันได้ถ้าสองสาขากดพร้อมกันเป๊ะ ๆ จึงมีตัวกันซ้ำที่ id อีกชั้น */
async function nextNumber(day, code) {
  const d = day.replace(/-/g, "");
  const [r] = await coreQuery(
    `SELECT COUNT(*) AS c FROM orders
     WHERE source = ${esc(POS_SOURCE)} AND order_date = ${esc(day)} AND channel = ${esc(`POS ${code}`)}`
  );
  // เลขที่แยกตามสาขา — สองสาขาออกบิลพร้อมกันแล้วเลขไม่ชนกัน
  return `${code}-${d}-${String(num(r?.c) + 1).padStart(3, "0")}`;
}

/** บันทึกใบขายหน้าร้าน — คืนใบที่บันทึกจริง (หรือบอกว่าเป็นใบซ้ำ) */
export async function createSale(input = {}) {
  if (!coreReady()) return { error: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };

  const day = DAY.test(String(input.day)) ? input.day : thaiToday();
  const items = Array.isArray(input.items) ? input.items : [];
  const clean = [];
  const bad = [];
  for (const [i, it] of items.entries()) {
    const sku = String(it?.sku ?? "").trim().slice(0, 60);
    const qty = Number(it?.qty);
    const price = Number(it?.price);
    if (!sku) bad.push({ line: i + 1, why: "ไม่มี sku" });
    else if (!Number.isFinite(qty) || qty <= 0) bad.push({ line: i + 1, sku, why: "qty ต้องมากกว่า 0" });
    else if (!Number.isFinite(price) || price < 0) bad.push({ line: i + 1, sku, why: "price ต้องไม่ติดลบ" });
    // ⚠️ **ราคา 0 ต้องยืนยันเสมอ** — เจอจริง 2 ก.ย. 2569 ตอนทดสอบจอ POS:
    //    สินค้าหลายตัวในคลังมีราคาเป็น 0 (ยังไม่ได้ตั้งราคา) พอแคชเชียร์ยิงรหัสเข้าไป
    //    บิลออกเป็น ฿0 โดยไม่มีอะไรเตือน = **ขายฟรีโดยไม่มีใครรู้** และไปโผล่เป็นยอดขาย 0 บาท
    //    แจกของฟรีมีจริง จึงไม่ห้ามตาย ๆ แต่ต้องเป็นการ "ตั้งใจ" ผ่าน allowZero เท่านั้น
    // ส่วนลดต่อชิ้น (บาท/ชิ้น) — ลดเกินราคาไม่ได้ ไม่งั้นได้ยอดติดลบเข้าบัญชี
    else if (!Number.isFinite(Number(it?.discount ?? 0)) || Number(it?.discount ?? 0) < 0)
      bad.push({ line: i + 1, sku, why: "ส่วนลดต่อชิ้นต้องไม่ติดลบ" });
    else if (Number(it?.discount ?? 0) > price)
      bad.push({ line: i + 1, sku, why: "ส่วนลดต่อชิ้นมากกว่าราคาสินค้า" });
    else if (price === 0 && !input.allowZero)
      bad.push({ line: i + 1, sku, why: "สินค้านี้ราคา 0 — ถ้าตั้งใจแจกฟรีให้ยืนยันก่อน" });
    else
      clean.push({
        sku, name: String(it?.name ?? "").slice(0, 120), qty, price,
        discount: Number(it?.discount ?? 0),
      });
  }
  if (!clean.length) return { error: "ไม่มีรายการสินค้าที่ใช้ได้", bad };
  if (clean.length > 100) return { error: "ใบเดียวใส่ได้ไม่เกิน 100 รายการ" };

  // สาขาบังคับใส่ และต้องเป็นสาขาที่มีจริง — ขายหน้าร้านโดยไม่รู้ว่าสาขาไหน
  // = เอาไปกระทบยอดรายสาขาและสต็อกรายคลังไม่ได้เลย
  const list = branches();
  const code = String(input.branch ?? "").trim().toUpperCase();
  const branch = list.find((b) => b.code === code);
  if (!branch) {
    return { error: `ต้องระบุสาขา (${list.map((b) => b.code).join(" หรือ ")})` };
  }

  // วิธีจ่าย — ไม่ส่งมาถือว่าเงินสด (ค่าปริยายของหน้าร้าน) แต่ถ้าส่งค่าที่ไม่รู้จักต้องตีกลับ
  // ห้ามเงียบ ๆ เปลี่ยนเป็นเงินสดให้ ไม่งั้นยอดโอนจะไปโผล่ในลิ้นชักเงินสดตอนปิดยอด
  const payRaw = String(input.payMethod ?? "cash").trim().toLowerCase();
  if (!PAY_METHODS[payRaw]) {
    return { error: `payMethod ต้องเป็น ${Object.keys(PAY_METHODS).join(" / ")}` };
  }

  const number = String(input.number ?? "").trim().slice(0, 40) || (await nextNumber(day, branch.code));
  const id = `${POS_SOURCE}/${number}`;
  // ⚠️ **เซิร์ฟเวอร์คิดเงินใหม่เองเสมอ ไม่เชื่อยอดจากเบราว์เซอร์** (กติกาเดิมของร้าน
  //    ที่ใช้กับหน้าเช็คเอาต์อยู่แล้ว) — จอส่งมาแค่ราคา/จำนวน/ส่วนลด ยอดรวมคิดที่นี่
  const sub = Math.round(clean.reduce((s, it) => s + it.qty * (it.price - it.discount), 0) * 100) / 100;
  const billDiscount = Number(input.billDiscount ?? 0);
  if (!Number.isFinite(billDiscount) || billDiscount < 0) {
    return { error: "ส่วนลดท้ายบิลต้องไม่ติดลบ" };
  }
  if (billDiscount > sub) {
    return { error: `ส่วนลดท้ายบิล (${billDiscount}) มากกว่ายอดก่อนลด (${sub})` };
  }
  const amount = Math.round((sub - billDiscount) * 100) / 100;

  // กันยิงซ้ำ: ใบเดิมเลขเดิม = ไม่เขียนทับ คืนของเดิมไปเลย
  // (เน็ตสะดุดแล้วกดซ้ำเป็นเรื่องปกติของเครื่องคิดเงินหน้าร้าน)
  const [exists] = await coreQuery(
    `SELECT id, number, amount, status, order_date FROM orders WHERE id = ${esc(id)}`
  );
  if (exists) return { duplicate: true, order: exists };

  await coreQuery(
    `INSERT INTO orders (id,source,number,channel,status,amount,customer,order_date,pay_method,bill_discount,updated_at)
     VALUES (${esc(id)},${esc(POS_SOURCE)},${esc(number)},${esc(`POS ${branch.code}`)},
             'Success',${amount},${esc(String(input.customer ?? "").slice(0, 120))},${esc(day)},
             ${esc(payRaw)},${billDiscount},datetime('now'))`
  );
  const values = clean
    .map(
      (it, i) =>
        `(${esc(id)},${i + 1},${esc(it.sku)},${esc(it.name)},${it.qty},` +
        `${Math.round(it.qty * (it.price - it.discount) * 100) / 100},${it.discount})`
    )
    .join(",");
  await coreQuery(
    `INSERT INTO order_items (order_id,line,sku,name,qty,amount,discount) VALUES ${values}`
  );

  return {
    order: {
      id, number, branch: branch.code, channel: `POS ${branch.code}`,
      order_date: day, subtotal: sub, billDiscount, amount, status: "Success",
      payMethod: payRaw, payMethodName: PAY_METHODS[payRaw],
    },
    lines: clean.length,
    bad: bad.length ? bad : undefined,
  };
}

/** ยกเลิกใบขายหน้าร้าน — เปลี่ยนสถานะ ไม่ลบ (บัญชีขายต้องตามรอยได้) */
export async function voidSale(number) {
  if (!coreReady()) return { error: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const n = String(number ?? "").trim().slice(0, 40);
  if (!n) return { error: "ต้องระบุเลขที่ใบ" };
  const id = `${POS_SOURCE}/${n}`;
  const [row] = await coreQuery(
    `SELECT id, number, amount, status FROM orders WHERE id = ${esc(id)}`
  );
  if (!row) return { error: `ไม่พบใบ ${n}` };
  if (String(row.status) === "Voided") return { alreadyVoided: true, order: row };
  await coreQuery(
    `UPDATE orders SET status = 'Voided', updated_at = datetime('now') WHERE id = ${esc(id)}`
  );
  return { voided: { ...row, status: "Voided" } };
}

/** ลบใบขายหน้าร้านทิ้งถาวร — **เฉพาะใบที่ยกเลิกแล้วเท่านั้น**
 *
 * ทำไมต้องมี: ใบทดสอบตอนต่อท่อไม่มีทางเอาออกได้เลย (voidSale แค่เปลี่ยนสถานะ)
 * ⇒ ค้างเป็นแถว "ยกเลิก" ในจอรายการขายและตัวเทียบยอดกับ ZORT ตลอดไป
 *
 * ⚠️ **ห้ามขยายให้ลบใบที่ยังไม่ยกเลิกเด็ดขาด** — บัญชีขายต้องตามรอยได้
 *    ท่านี้ปลอดภัยเพราะใบที่ยกเลิกแล้วไม่กระทบอะไรเลย: ไม่นับในยอดขาย
 *    และตัวคิดสต็อกคัดใบยกเลิกออกอยู่แล้ว ⇒ ลบทิ้งได้โดยไม่มีตัวเลขไหนขยับ
 * ⚠️ แตะได้เฉพาะใบที่ source = 'pos' — ห้ามไปแตะออเดอร์ที่กระจกมาจาก ZORT/มาร์เก็ตเพลส
 *    พวกนั้นกระจกจะดึงกลับมาใหม่อยู่ดี และเป็นข้อมูลของระบบอื่น */
export async function deleteVoidedSale(number) {
  if (!coreReady()) return { error: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const n = String(number ?? "").trim().slice(0, 40);
  if (!n) return { error: "ต้องระบุเลขที่ใบ" };
  const id = `${POS_SOURCE}/${n}`;
  const [row] = await coreQuery(
    `SELECT id, number, status, amount FROM orders WHERE id = ${esc(id)} AND source = ${esc(POS_SOURCE)}`
  );
  if (!row) return { error: `ไม่พบใบขายหน้าร้านเลขที่ ${n}` };
  if (String(row.status) !== "Voided") {
    return { error: `ใบ ${n} ยังไม่ถูกยกเลิก — ต้องยกเลิกก่อนถึงจะลบได้ (DELETE ?salevoid=${n})` };
  }
  await coreQuery(`DELETE FROM order_items WHERE order_id = ${esc(id)}`);
  await coreQuery(`DELETE FROM orders WHERE id = ${esc(id)}`);
  return { deleted: row };
}

/** ใบขายหน้าร้านล่าสุด — ให้จอ POS เอาไปโชว์ประวัติของวัน */
export async function listSales({ day = "", limit = 50 } = {}) {
  if (!coreReady()) return { error: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const d = DAY.test(String(day)) ? day : thaiToday();
  const lim = Math.max(1, Math.min(200, num(limit) || 50));
  const rows = await coreQuery(
    `SELECT number, channel, status, amount, customer, order_date, pay_method
     FROM orders WHERE source = ${esc(POS_SOURCE)} AND order_date = ${esc(d)}
     ORDER BY number DESC LIMIT ${lim}`
  );
  // ยอดแยกตามวิธีจ่าย — ตัวเลขที่ต้องใช้ตอนปิดยอดสิ้นวันจริง ๆ
  const byPay = await coreQuery(
    `SELECT COALESCE(pay_method,'cash') AS pay, COUNT(*) AS orders,
            ROUND(COALESCE(SUM(amount),0),2) AS amount
     FROM orders WHERE source = ${esc(POS_SOURCE)} AND order_date = ${esc(d)}
       AND status <> 'Voided'
     GROUP BY COALESCE(pay_method,'cash')`
  );
  const [sum] = await coreQuery(
    `SELECT COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS s
     FROM orders WHERE source = ${esc(POS_SOURCE)} AND order_date = ${esc(d)}
       AND status <> 'Voided'`
  );
  return {
    day: d,
    total: num(sum?.c),
    totalAmount: num(sum?.s),
    methods: PAY_METHODS,
    byPay: byPay.map((r) => ({ ...r, name: PAY_METHODS[r.pay] ?? r.pay })),
    rows,
  };
}

/** ค้นสินค้าให้เครื่องคิดเงิน — พิมพ์รหัสหรือชื่อแล้วได้ราคา+ของคงเหลือทันที
 *  ⚠️ อ่านจากภาพถ่ายสต็อกล่าสุด ซึ่งถ่ายตอนตี 1 ⇒ ของคงเหลือเป็น "ตัวช่วยดู" ไม่ใช่ตัวห้ามขาย
 *     ห้ามเอาไปบล็อกการขายเด็ดขาด ลูกค้ายืนอยู่หน้าร้านแล้วขายไม่ได้เพราะเลขไม่ตรง แย่กว่าขายเกิน */
export async function lookup(q, limit = 20, cat = "", offset = 0) {
  if (!coreReady()) return { error: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const term = String(q ?? "").trim().slice(0, 60);
  const group = String(cat ?? "").trim();
  // เลือกหมวดอย่างเดียวโดยไม่พิมพ์คำค้นได้ (คนขายกดปุ่มหมวด ไม่ได้พิมพ์รหัส)
  if (!term && !group) return { rows: [] };
  // ⚠️ เพดาน 200 ไม่ใช่ 50 — หมวดใหญ่สุด (อะไหล่ 8800/9800) มี 462 ตัว
  //    ถ้าตัดที่ 50 คนขายจะเห็นของแค่หนึ่งในเก้าของหมวด **โดยไม่มีอะไรบอกว่าถูกตัด**
  const lim = Math.max(1, Math.min(200, num(limit) || 20));
  const off = Math.max(0, num(offset));
  const [latest] = await coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`);
  const day = latest?.d;
  if (!day) return { rows: [] };
  const where = term
    ? `AND (s.sku LIKE ? OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.sku = s.sku AND oi.name LIKE ?))`
    : "";
  const params = term ? [day, `%${term}%`, `%${term}%`, term] : [day];
  const rows = await coreQuery(
    `SELECT s.sku AS sku, s.qty AS qty, s.price AS price,
            COALESCE((SELECT name FROM products WHERE sku = s.sku AND name <> ''),
                     (SELECT name FROM order_items WHERE sku = s.sku AND name <> '' LIMIT 1)) AS name
     FROM stock_snapshots s
     WHERE s.day = ? ${where}
     ORDER BY ${term ? "CASE WHEN s.sku = ? THEN 0 ELSE 1 END," : ""} s.qty DESC
     -- ⚠️ เลือกหมวด = ต้องดึงมาทั้งคลังก่อนแล้วค่อยกรอง เพราะหมวดคิดจาก "ชื่อ" ไม่ได้เก็บในฐาน
     --    เดิมตัดที่ 400 แถวแรกแล้วกรองในหน่วยความจำ ⇒ หมวดที่ของอยู่ท้ายตารางได้ 0 ชิ้น
     --    ทั้งที่มีของจริงเป็นร้อย (เจอจริง: กด 'บาร์ KINGKONG' ที่มี 113 ตัว แล้วว่างเปล่า)
     --    2,672 แถวดึงทีเดียวไหว — การกรองบางส่วนแล้วบอกว่า "ไม่มีของ" อันตรายกว่าช้าขึ้นนิดเดียว
     LIMIT ${group ? 5000 : lim}`,
    params
  );
  // กรองหมวดในหน่วยความจำ — หมวดคิดจากชื่อ ไม่ได้เก็บในฐาน จึงกรองด้วย SQL ไม่ได้
  const picked = group ? rows.filter((r) => groupOf(r.name, r.sku).code === group) : rows;
  return {
    day,
    cat: group || null,
    // บอกจำนวนทั้งหมดของหมวดไปด้วย จอจะได้ทำเลขหน้าและรู้ว่ายังมีของเหลือ
    total: picked.length,
    offset: off,
    rows: picked
      .slice(off, off + lim)
      .map((r) => ({ sku: r.sku, name: r.name || "", price: num(r.price), qty: num(r.qty) })),
  };
}

// ── หมวดหมู่สินค้าสำหรับแผงปุ่มของเครื่องคิดเงิน ──────────────────────────────
//
// ⚠️ **ZORT ไม่มีหมวดหมู่ในข้อมูลสินค้าเลย** — สุ่มตรวจ 200 ตัว ได้ category = null ทุกตัว
//    และ producttype = 0 ทุกตัว ⇒ ปุ่มหมวดในแอป POS ของ ZORT ไม่ได้มาจากตัวสินค้า
//    แต่มาจาก "กลุ่มสินค้า" ที่ตั้งไว้ในหลังบ้านของ ZORT POS เอง ซึ่งไม่มี API ให้ดึง
// ⇒ เราจึง **จัดกลุ่มเองจากชื่อสินค้า** เป็นค่าเริ่มต้น ให้ใช้งานได้ทันทีโดยไม่ต้องรอใครมานั่งจัด
//
// ⚠️ นี่คือการ "เดาจากชื่อ" ไม่ใช่ข้อมูลจริงจากต้นทาง — ตัวไหนเข้าไม่ได้จะไปกอง "อื่น ๆ"
//    วันที่เจ้าของร้านอยากจัดเอง ค่อยทำตารางจับคู่ทีหลัง กติกาชุดนี้ไม่ขวาง
//
// 🔴 **ต้องดูจาก "คำขึ้นต้น" ของชื่อ ห้ามใช้ "มีคำนี้อยู่ในชื่อ" เด็ดขาด** (แก้ 2 ก.ย. 2569)
//    ชื่อสินค้าร้านนี้ขึ้นต้นด้วยชนิดของเสมอ แล้วต่อด้วยคำอธิบายที่มีชื่อชนิดอื่นปนอยู่:
//      "โซ่เลื่อยยนต์ NEWWAVE 3623"          ← เป็นโซ่ แต่มีคำว่า "เลื่อยยนต์"
//      "เลื่อยยนต์ KingKong 5800 พร้อมโซ่และบาร์" ← เป็นเลื่อย แต่มีทั้ง "โซ่" และ "บาร์"
//    กติกาเดิมใช้ /เลื่อยยนต์.*NEWWAVE/ แบบหาที่ไหนก็ได้ ⇒ **โซ่ทั้งหมดถูกนับเป็นเลื่อยยนต์**
//    ผลคือ กด "โซ่ NEWWAVE" ที่ขึ้นว่ามี 17 ตัว แล้วได้ของจริง 2 ตัว — ปุ่มที่โกหก
//    (เจอตอนยิงของจริง 2 ก.ย. 2569 · ตัวเลขบนปุ่มกับของที่ได้มาจากคนละชุดเหมือนกับ
//     กับดัก "แท็บยกเลิก (44) กดแล้วได้ 0" ในจอรายการขาย)

/** ตัดรหัสสินค้าที่บางชื่อเอามาแปะไว้ข้างหน้า ("00596 ชุดเร่งโซ่ MS381" → "ชุดเร่งโซ่ MS381")
 *  ⚠️ ตัดเฉพาะเมื่อตรงกับรหัสของแถวนั้นจริง ๆ **ห้ามตัดตัวเลขนำหน้าแบบมั่ว**
 *     ไม่งั้นชื่ออย่าง "5200 ฝาสูบ" จะโดนตัดคำที่ใช้แยกรุ่นทิ้ง แล้วรุ่นจะจับไม่ได้ */
function bareName(name, sku) {
  const n = String(name ?? "").trim();
  const s = String(sku ?? "").trim();
  return s && n.startsWith(s) ? n.slice(s.length).trim() : n;
}

// ชนิดของ — ดูจากคำขึ้นต้นเท่านั้น (เรียงเฉพาะ→ทั่วไป)
const KINDS = [
  { code: "chain", name: "โซ่", re: /^(ข้อต่อโซ่|โซ่)/, brandable: true },
  { code: "bar", name: "บาร์", re: /^(บาร์|แผ่นบังคับโซ่|ปลอกบาร์)/, brandable: true },
  {
    code: "saw",
    name: "เลื่อยยนต์",
    re: /^เลื่อย/,
    brandable: true,
    // เลื่อยที่มีทะเบียนแยกกองต่างหาก — ตรงกับปุ่ม "เลื่อยยนต์ แบบมีทะเบียน" ในเครื่อง ZORT ตัวจริง
    // ⚠️ ไม่ใช่เรื่องความสวยงาม — เลื่อยกลุ่มนี้ขายแล้วต้องทำเรื่อง ลซ.๒ ให้ลูกค้า
    //    คนขายต้องแยกออกตั้งแต่ตอนกดปุ่ม ไม่ใช่มารู้ตอนจะเก็บเงิน
    special: { code: "saw-reg", name: "เลื่อยยนต์ มีทะเบียน", re: /เลขทะเบียน|มีทะเบียน|ถูกต้องตามกฎหมาย/ },
  },
  { code: "file", name: "ตะไบ / ลับโซ่", re: /^(ตะไบ|ลับโซ่|หินเจียร)/ },
  { code: "plug", name: "หัวเทียน", re: /^หัวเทียน/ },
  { code: "oil", name: "น้ำมัน / จาระบี", re: /^(น้ำมัน|จาระบี)/ },
  { code: "start", name: "ชุดสตาร์ท", re: /^(ชุดสตาร์ท|สตาร์ท|ลานสตาร์ท)/ },
  { code: "service", name: "ค่าบริการ", re: /^ค่า/ },
];

// ยี่ห้อ — หาที่ไหนในชื่อก็ได้ (ยี่ห้อมักอยู่กลางชื่อ)
const BRANDS = [
  { code: "kk", name: "KINGKONG", re: /KING\s*KONG/i },
  { code: "nw", name: "NEWWAVE", re: /NEW\s*WAVE/i },
];

/** เลขรุ่นที่ต้องไม่ติดกับตัวเลขอื่น — "070" ใน "MS070" ใช่ · ใน "12070" ไม่ใช่ */
const modelRe = (...tokens) => new RegExp(`(?<![0-9])(${tokens.join("|")})(?![0-9])`, "i");

// ⚠️ อะไหล่ส่วนใหญ่ชื่อเป็นภาษาอังกฤษแยกตาม "รุ่นเครื่อง" (MUFFLER 288XP · GEAR WHEEL MS070)
//    ไม่มีคำไทยขึ้นต้นให้จับ ⇒ ใช้เป็นตาข่ายชั้นสอง หาที่ไหนในชื่อก็ได้
// ⚠️ ตาข่ายนี้ทำงาน **หลัง** KINDS เสมอ จึงไม่ต้องกลัวว่า "เลื่อยยนต์ NEWWAVE F660"
//    จะโดนจับเป็นอะไหล่ MS660 — ตัวนั้นถูกจับเป็นเลื่อยไปตั้งแต่ชั้นแรกแล้ว
// ⚠️ **ห้ามใส่เลขล้วน "180"** — วัดแล้วมีแค่ 2 ตัวที่พึ่งมัน และทั้งคู่จับผิด
//    ("ใบเลื่อยวงเดือน STIHL 18-180" · "BREATHER VALVE NO.180 7800TB" ซึ่งที่จริงเป็นของ 7800)
const MODELS = [
  { code: "p-288xp", name: "อะไหล่ 288XP", re: /288\s*XP/i },
  { code: "p-ms070", name: "อะไหล่ MS070 / 070", re: modelRe("MS\\s*070", "070") },
  { code: "p-ms660", name: "อะไหล่ MS660 / 066", re: modelRe("MS\\s*660", "660", "066") },
  { code: "p-ms440", name: "อะไหล่ MS440 / 044", re: modelRe("MS\\s*440", "440", "044") },
  { code: "p-ms381", name: "อะไหล่ MS381 / 038", re: modelRe("MS\\s*381", "381", "038") },
  { code: "p-ms250", name: "อะไหล่ MS250", re: modelRe("MS\\s*250") },
  { code: "p-ms180", name: "อะไหล่ MS180", re: modelRe("MS\\s*180") },
  { code: "p-mini", name: "อะไหล่ MINI", re: /\bMINI\b/i },
  { code: "p-cs", name: "อะไหล่ CS (เลื่อยไฟฟ้า)", re: /\bCS\s*\d{3,4}/i },
  { code: "p-5200", name: "อะไหล่ 5200 / 5800", re: modelRe("5200", "5800") },
  { code: "p-7800", name: "อะไหล่ 7800", re: modelRe("7800") },
  { code: "p-8800", name: "อะไหล่ 8800 / 9800", re: modelRe("8800", "9800") },
  { code: "p-3800", name: "อะไหล่ 3800", re: modelRe("3800") },
  { code: "p-atom", name: "อะไหล่ ATOM", re: /\bATOM\b/i },
];

const OTHER = { code: "other", name: "อื่น ๆ" };

/** ลำดับปุ่มบนแผง — ชนิดที่แยกยี่ห้อได้ให้ KINGKONG/NEWWAVE มาก่อน แล้วค่อย "อื่น ๆ" ของชนิดนั้น */
const CAT_ORDER = (() => {
  const out = [];
  for (const k of KINDS) {
    if (k.special) out.push({ code: k.special.code, name: k.special.name });
    if (k.brandable) {
      for (const b of BRANDS) out.push({ code: `${k.code}-${b.code}`, name: `${k.name} ${b.name}` });
      out.push({ code: k.code, name: `${k.name} (อื่น ๆ)` });
    } else out.push({ code: k.code, name: k.name });
  }
  for (const m of MODELS) out.push({ code: m.code, name: m.name });
  out.push(OTHER);
  return out;
})();
const CAT_NAME = new Map(CAT_ORDER.map((c) => [c.code, c.name]));

/** ชื่อสินค้า (+รหัส) → หมวด · คืน {code,name} เสมอ ตกทุกกติกาก็ได้ "อื่น ๆ" ไม่มีทางคืน null */
function groupOf(name, sku) {
  const n = bareName(name, sku);
  if (!n) return OTHER;
  const kind = KINDS.find((k) => k.re.test(n));
  if (kind) {
    if (kind.special && kind.special.re.test(n)) {
      return { code: kind.special.code, name: kind.special.name };
    }
    if (!kind.brandable) return { code: kind.code, name: CAT_NAME.get(kind.code) };
    const brand = BRANDS.find((b) => b.re.test(n));
    const code = brand ? `${kind.code}-${brand.code}` : kind.code;
    return { code, name: CAT_NAME.get(code) };
  }
  const model = MODELS.find((m) => m.re.test(n));
  return model ? { code: model.code, name: CAT_NAME.get(model.code) } : OTHER;
}

/** รายชื่อหมวดที่ "มีสินค้าจริง" พร้อมจำนวน — จอเอาไปทำปุ่มแผงซ้าย
 *  ⚠️ คืนเฉพาะหมวดที่มีของ ไม่คืนหมวดเปล่า — ปุ่มที่กดแล้วไม่มีอะไรคือปุ่มหลอก
 *  ⚠️ ตัวเลข items ต้องมาจากกติกาชุดเดียวกับที่ poslookup ใช้กรอง ห้ามคิดคนละทาง
 *     ไม่งั้นเลขบนปุ่มกับของที่ได้จะไม่ตรงกัน แล้วไม่มีอะไรฟ้อง */
export async function posCats() {
  if (!coreReady()) return { error: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const [latest] = await coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`);
  const day = latest?.d;
  if (!day) return { cats: [] };
  const rows = await coreQuery(
    `SELECT s.sku AS sku,
            COALESCE((SELECT name FROM products WHERE sku = s.sku AND name <> ''),
                     (SELECT name FROM order_items WHERE sku = s.sku AND name <> '' LIMIT 1)) AS name
     FROM stock_snapshots s WHERE s.day = ?`,
    [day]
  );
  const count = new Map();
  let unnamed = 0;
  for (const r of rows) {
    if (!String(r.name ?? "").trim()) unnamed += 1;
    const g = groupOf(r.name, r.sku);
    const cur = count.get(g.code) ?? { code: g.code, name: g.name, items: 0 };
    cur.items += 1;
    count.set(g.code, cur);
  }
  return {
    day,
    note: "หมวดหมู่จัดจากชื่อสินค้า (ZORT ไม่มีหมวดหมู่ในข้อมูลสินค้า) — ตัวที่เข้าไม่ได้อยู่ 'อื่น ๆ'",
    // ⚠️ บอกจำนวนตัวที่ "ไม่มีชื่อเลย" ออกไปด้วย — พวกนี้ไปกอง 'อื่น ๆ' โดยไม่มีทางจัดหมวดได้
    //    ถ้าไม่บอก จอจะดูเหมือนกติกาจัดหมวดห่วย ทั้งที่ต้นเหตุคือคลังไม่มีชื่อสินค้า
    unnamed,
    cats: CAT_ORDER.map((c) => count.get(c.code)).filter(Boolean),
  };
}
