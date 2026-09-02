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
    else clean.push({ sku, name: String(it?.name ?? "").slice(0, 120), qty, price });
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

  const number = String(input.number ?? "").trim().slice(0, 40) || (await nextNumber(day, branch.code));
  const id = `${POS_SOURCE}/${number}`;
  const amount = Math.round(clean.reduce((s, it) => s + it.qty * it.price, 0) * 100) / 100;

  // กันยิงซ้ำ: ใบเดิมเลขเดิม = ไม่เขียนทับ คืนของเดิมไปเลย
  // (เน็ตสะดุดแล้วกดซ้ำเป็นเรื่องปกติของเครื่องคิดเงินหน้าร้าน)
  const [exists] = await coreQuery(
    `SELECT id, number, amount, status, order_date FROM orders WHERE id = ${esc(id)}`
  );
  if (exists) return { duplicate: true, order: exists };

  await coreQuery(
    `INSERT INTO orders (id,source,number,channel,status,amount,customer,order_date,updated_at)
     VALUES (${esc(id)},${esc(POS_SOURCE)},${esc(number)},${esc(`POS ${branch.code}`)},
             'Success',${amount},${esc(String(input.customer ?? "").slice(0, 120))},${esc(day)},datetime('now'))`
  );
  const values = clean
    .map((it, i) => `(${esc(id)},${i + 1},${esc(it.sku)},${esc(it.name)},${it.qty},${Math.round(it.qty * it.price * 100) / 100})`)
    .join(",");
  await coreQuery(
    `INSERT INTO order_items (order_id,line,sku,name,qty,amount) VALUES ${values}`
  );

  return {
    order: { id, number, branch: branch.code, channel: `POS ${branch.code}`, order_date: day, amount, status: "Success" },
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

/** ใบขายหน้าร้านล่าสุด — ให้จอ POS เอาไปโชว์ประวัติของวัน */
export async function listSales({ day = "", limit = 50 } = {}) {
  if (!coreReady()) return { error: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const d = DAY.test(String(day)) ? day : thaiToday();
  const lim = Math.max(1, Math.min(200, num(limit) || 50));
  const rows = await coreQuery(
    `SELECT number, channel, status, amount, customer, order_date
     FROM orders WHERE source = ${esc(POS_SOURCE)} AND order_date = ${esc(d)}
     ORDER BY number DESC LIMIT ${lim}`
  );
  const [sum] = await coreQuery(
    `SELECT COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS s
     FROM orders WHERE source = ${esc(POS_SOURCE)} AND order_date = ${esc(d)}
       AND status <> 'Voided'`
  );
  return { day: d, total: num(sum?.c), totalAmount: num(sum?.s), rows };
}

/** ค้นสินค้าให้เครื่องคิดเงิน — พิมพ์รหัสหรือชื่อแล้วได้ราคา+ของคงเหลือทันที
 *  ⚠️ อ่านจากภาพถ่ายสต็อกล่าสุด ซึ่งถ่ายตอนตี 1 ⇒ ของคงเหลือเป็น "ตัวช่วยดู" ไม่ใช่ตัวห้ามขาย
 *     ห้ามเอาไปบล็อกการขายเด็ดขาด ลูกค้ายืนอยู่หน้าร้านแล้วขายไม่ได้เพราะเลขไม่ตรง แย่กว่าขายเกิน */
export async function lookup(q, limit = 20) {
  if (!coreReady()) return { error: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const term = String(q ?? "").trim().slice(0, 60);
  if (!term) return { rows: [] };
  const lim = Math.max(1, Math.min(50, num(limit) || 20));
  const [latest] = await coreQuery(`SELECT MAX(day) AS d FROM stock_snapshots`);
  const day = latest?.d;
  if (!day) return { rows: [] };
  const rows = await coreQuery(
    `SELECT s.sku AS sku, s.qty AS qty, s.price AS price,
            (SELECT name FROM order_items WHERE sku = s.sku AND name <> '' LIMIT 1) AS name
     FROM stock_snapshots s
     WHERE s.day = ?
       AND (s.sku LIKE ? OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.sku = s.sku AND oi.name LIKE ?))
     ORDER BY CASE WHEN s.sku = ? THEN 0 ELSE 1 END, s.qty DESC
     LIMIT ${lim}`,
    [day, `%${term}%`, `%${term}%`, term]
  );
  return {
    day,
    rows: rows.map((r) => ({ sku: r.sku, name: r.name || "", price: num(r.price), qty: num(r.qty) })),
  };
}
