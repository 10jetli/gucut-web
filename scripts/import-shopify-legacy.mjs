// แปลงไฟล์ส่งออกจาก Shopify → ประวัติลูกค้าเก่าที่เว็บเราเปิดดูได้
//
// ใช้ครั้งเดียวก่อนปิดร้าน Shopify (26 ส.ค. 2569) แล้วไม่ต้องรันอีก
//   node scripts/import-shopify-legacy.mjs <โฟลเดอร์ที่มี orders.csv กับ customers_export.csv>
//
// ⚠️ จับคู่ลูกค้าด้วย "เบอร์โทร" เป็นหลัก ไม่ใช่อีเมล
//    ลูกค้าร้านนี้ส่วนใหญ่ไม่มีอีเมล (สมัครด้วยเบอร์ หรือสั่งแบบไม่สมัคร)
//    และระบบสมาชิกของเว็บใหม่ก็ผูกกับเบอร์เหมือนกัน — ใช้เบอร์จึงต่อกันติด
//
// ⚠️ เบอร์ต้องล้างให้เหลือตัวเลขและตัดรหัสประเทศออก
//    ไฟล์จาก Shopify มีทั้ง +66812345678 · 0812345678 · 66812345678 ปนกัน
//    ไม่ล้างก่อน = เบอร์เดียวกันกลายเป็นคนละคน
import fs from "node:fs";
import path from "node:path";

/** อ่าน CSV ที่มีเครื่องหมายคำพูดและขึ้นบรรทัดใหม่ในเซลล์ได้ */
function parseCsv(txt) {
  const rows = []; let row = [], cell = "", inQ = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (inQ) {
      if (c === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const table = (file) => {
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  const head = rows[0];
  return rows.slice(1)
    .filter((r) => r.length >= head.length - 2)
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
};

/** เบอร์ไทยให้เหลือ 9-10 หลักแบบขึ้นต้น 0 — กติกาเดียวกับ netlify/lib/session.mjs */
function normPhone(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("66")) d = "0" + d.slice(2);
  if (d.length === 9 && !d.startsWith("0")) d = "0" + d;
  return d.length >= 9 ? d.slice(-10) : "";
}

const dir = process.argv[2];
if (!dir) { console.error("ต้องบอกโฟลเดอร์ที่มีไฟล์ CSV"); process.exit(1); }

const orders = table(path.join(dir, "orders.csv"));
const customers = table(path.join(dir, "customers_export.csv"));

// ---------- รวมบรรทัดสินค้าเข้าเป็นออเดอร์ ----------
// ⚠️ Shopify ออก CSV แบบ "หนึ่งบรรทัด = หนึ่งรายการสินค้า"
//    ออเดอร์ที่มี 5 ชิ้นจึงกินไป 5 บรรทัด และบรรทัดที่ 2-5 จะมีแต่ข้อมูลสินค้า
//    ช่องอื่นว่างหมด ต้องเอาหัวออเดอร์จากบรรทัดแรกเท่านั้น
const byOrder = new Map();
for (const r of orders) {
  const name = r["Name"];
  if (!name) continue;
  if (!byOrder.has(name)) {
    byOrder.set(name, {
      id: name,
      at: r["Created at"] || "",
      paid: r["Financial Status"] || "",
      ship: r["Fulfillment Status"] || "",
      total: Number(r["Total"]) || 0,
      phone: normPhone(r["Shipping Phone"] || r["Phone"] || r["Billing Phone"]),
      name: (r["Shipping Name"] || r["Billing Name"] || "").trim(),
      addr: [r["Shipping Address1"], r["Shipping City"], r["Shipping Province"], r["Shipping Zip"]]
        .filter(Boolean).join(" ").trim(),
      items: [],
    });
  }
  const o = byOrder.get(name);
  const title = r["Lineitem name"];
  if (title) {
    o.items.push({
      t: title,
      q: Number(r["Lineitem quantity"]) || 1,
      p: Number(r["Lineitem price"]) || 0,
      sku: r["Lineitem sku"] || undefined,
    });
  }
}

const list = [...byOrder.values()].sort((a, b) => (a.at < b.at ? 1 : -1));

// ---------- ลูกค้า ----------
const people = customers.map((c) => ({
  name: [c["First Name"], c["Last Name"]].filter(Boolean).join(" ").trim(),
  phone: normPhone(c["Phone"] || c["Default Address Phone"]),
  email: (c["Email"] || "").trim().toLowerCase() || undefined,
  spent: Number(c["Total Spent"]) || 0,
  orders: Number(c["Total Orders"]) || 0,
  addr: [c["Default Address Address1"], c["Default Address City"], c["Default Address Province Code"]]
    .filter(Boolean).join(" ").trim() || undefined,
})).filter((p) => p.name || p.phone);

const out = {
  note: "ประวัติจากร้าน Shopify เดิม ดึงออกมา 22 ส.ค. 2569 ก่อนปิดร้าน 26 ส.ค. — ข้อมูลนิ่ง ไม่มีอะไรมาอัปเดตอีก",
  at: Date.now(),
  orders: list,
  customers: people,
};

// ⚠️ เก็บเป็นโมดูล JS ใต้ netlify/ ไม่ใช่ JSON ใน public/
//    ข้อมูลนี้มีชื่อ เบอร์โทร และที่อยู่ลูกค้า — วางใน public/ = ใครก็โหลดได้
//    เป็นโมดูลใต้ netlify/ จะถูกมัดรวมเข้าไปในฟังก์ชัน เข้าถึงได้เฉพาะฝั่งเซิร์ฟเวอร์
const dest = path.join(process.cwd(), "netlify/lib/legacy-data.mjs");
fs.writeFileSync(dest, "// สร้างจาก scripts/import-shopify-legacy.mjs — ห้ามแก้มือ\nexport default " + JSON.stringify(out) + ";\n");

const withPhone = list.filter((o) => o.phone).length;
console.log(`ออเดอร์เก่า      ${list.length} ใบ (มีเบอร์โทร ${withPhone})`);
console.log(`ลูกค้าเก่า       ${people.length} คน (มีเบอร์โทร ${people.filter((p) => p.phone).length})`);
console.log(`ยอดขายรวม       ฿${Math.round(list.reduce((s, o) => s + o.total, 0)).toLocaleString("th-TH")}`);
console.log(`เขียนไฟล์       ${path.relative(process.cwd(), dest)} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
