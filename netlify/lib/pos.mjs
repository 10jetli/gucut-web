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
export async function lookup(q, limit = 20, cat = "") {
  if (!coreReady()) return { error: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const term = String(q ?? "").trim().slice(0, 60);
  const group = String(cat ?? "").trim();
  // เลือกหมวดอย่างเดียวโดยไม่พิมพ์คำค้นได้ (คนขายกดปุ่มหมวด ไม่ได้พิมพ์รหัส)
  if (!term && !group) return { rows: [] };
  const lim = Math.max(1, Math.min(50, num(limit) || 20));
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
  const picked = group ? rows.filter((r) => groupOf(r.name).code === group) : rows;
  return {
    day,
    cat: group || null,
    rows: picked
      .slice(0, lim)
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
const GROUPS = [
  { code: "saw-kk", name: "เลื่อยยนต์ KINGKONG", re: /เลื่อยยนต์.*KINGKONG|KINGKONG.*เลื่อยยนต์/i },
  { code: "saw-nw", name: "เลื่อยยนต์ NEWWAVE", re: /เลื่อยยนต์.*NEWWAVE|NEWWAVE.*เลื่อยยนต์/i },
  { code: "saw", name: "เลื่อยยนต์ (อื่น ๆ)", re: /เลื่อยยนต์|เลื่อยโซ่/i },
  { code: "bar-kk", name: "บาร์ KINGKONG", re: /บาร์.*KINGKONG/i },
  { code: "bar-nw", name: "บาร์ NEWWAVE", re: /บาร์.*NEWWAVE/i },
  { code: "bar", name: "บาร์ (อื่น ๆ)", re: /บาร์เลื่อย|แผ่นบังคับโซ่/i },
  { code: "chain-kk", name: "โซ่ KINGKONG", re: /โซ่.*KINGKONG/i },
  { code: "chain-nw", name: "โซ่ NEWWAVE", re: /โซ่.*NEWWAVE/i },
  { code: "chain", name: "โซ่ (อื่น ๆ)", re: /โซ่เลื่อย|โซ่ม้วน/i },
  { code: "file", name: "ตะไบ / ลับโซ่", re: /ตะไบ|ลับโซ่|หินเจียร/i },
  { code: "plug", name: "หัวเทียน", re: /หัวเทียน/i },
  { code: "oil", name: "น้ำมัน / จาระบี", re: /น้ำมัน|จาระบี/i },
  { code: "start", name: "ชุดสตาร์ท", re: /สตาร์ท/i },
  { code: "service", name: "ค่าบริการ", re: /ค่าบริการ|ค่าซ่อม|ค่าส่ง/i },
  // ⚠️ อะไหล่ส่วนใหญ่ชื่อเป็นภาษาอังกฤษแยกตาม "รุ่นเครื่อง" (MUFFLER 288XP · GEAR WHEEL MS070)
  //    ไม่มีคำไทยให้จับ ⇒ ต้องจัดกลุ่มตามรุ่น ไม่งั้น 96% ของคลังไปกองรวมที่ 'อื่น ๆ'
  { code: "p-288xp", name: "อะไหล่ 288XP", re: /\b288\s*XP\b/i },
  { code: "p-ms070", name: "อะไหล่ MS070 / 070", re: /\bMS\s*070\b|\b070\b/i },
  { code: "p-ms660", name: "อะไหล่ MS660 / 066", re: /\bMS\s*660\b|\b066\b/i },
  { code: "p-ms440", name: "อะไหล่ MS440 / 044", re: /\bMS\s*440\b|\b044\b/i },
  { code: "p-ms381", name: "อะไหล่ MS381 / 038", re: /\bMS\s*381\b|\b038\b/i },
  { code: "p-5200", name: "อะไหล่ 5200 / 5800", re: /\b52 ?00\b|\b58 ?00\b/i },
  { code: "p-7800", name: "อะไหล่ 7800", re: /\b78 ?00\b/i },
  { code: "p-atom", name: "อะไหล่ ATOM", re: /\bATOM\b/i },
];

function groupOf(name) {
  const n = String(name ?? "");
  for (const g of GROUPS) if (g.re.test(n)) return g;
  return { code: "other", name: "อื่น ๆ" };
}

/** รายชื่อหมวดที่ "มีสินค้าจริง" พร้อมจำนวน — จอเอาไปทำปุ่มแผงซ้าย
 *  ⚠️ คืนเฉพาะหมวดที่มีของ ไม่คืนหมวดเปล่า — ปุ่มที่กดแล้วไม่มีอะไรคือปุ่มหลอก */
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
  for (const r of rows) {
    const g = groupOf(r.name);
    const cur = count.get(g.code) ?? { code: g.code, name: g.name, items: 0 };
    cur.items += 1;
    count.set(g.code, cur);
  }
  const order = [...GROUPS.map((g) => g.code), "other"];
  return {
    day,
    note: "หมวดหมู่จัดจากชื่อสินค้า (ZORT ไม่มีหมวดหมู่ในข้อมูลสินค้า) — ตัวที่เข้าไม่ได้อยู่ 'อื่น ๆ'",
    cats: order.map((c) => count.get(c)).filter(Boolean),
  };
}
