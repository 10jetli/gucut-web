// ย้ายแต้มลูกค้าเก่าเข้าระบบใหม่ → ยิงเข้า /api/points
//
// ใช้ตอนย้ายแต้มออกจาก CWILL (TrustWILL) Loyalty บน Shopify
// แต้มของแอปนั้นเก็บอยู่ในฐานข้อมูลของเขาเอง ไม่ได้อยู่ใน Shopify
// ต้อง export CSV ออกจากหน้าแอปก่อน
//
//   node scripts/import-points.mjs แต้มลูกค้า.csv
//
// ไฟล์ CSV ต้องมีหัวคอลัมน์ (ภาษาอังกฤษหรือไทยก็ได้)
//   phone / เบอร์โทร     ← จำเป็น
//   points / แต้ม        ← จำเป็น
//   name / ชื่อ          ← ไม่บังคับ
//
// เบอร์ไหนยังไม่ได้สมัครสมาชิกบนเว็บใหม่ ระบบจะ "พักแต้มไว้ที่เบอร์"
// พอลูกค้าคนนั้นสมัครหรือเข้าสู่ระบบครั้งแรก แต้มจะวิ่งเข้าบัญชีเอง
//
// ต้องมีรหัสหลังร้าน — ใส่ตอนรัน:  ADMIN_KEY=xxxx node scripts/import-points.mjs ไฟล์.csv
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

const SITE = process.env.SITE || "https://new78.com";
const file = process.argv[2];

if (!file) {
  console.log("ใช้:  ADMIN_KEY=รหัสหลังร้าน node scripts/import-points.mjs ไฟล์.csv");
  process.exit(1);
}

let key = process.env.ADMIN_KEY;
if (!key) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  key = (await rl.question("รหัสหลังร้าน (CHAT_ADMIN_KEY): ")).trim();
  rl.close();
}

// อ่าน CSV แบบง่าย ๆ (รองรับค่าที่อยู่ในเครื่องหมายคำพูด)
const rows = (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => {
  const out = [];
  let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
});

const head = rows.shift().map((h) => h.toLowerCase());
const find = (...names) => head.findIndex((h) => names.some((n) => h.includes(n)));
const iPhone = find("phone", "เบอร", "โทร", "mobile", "tel");
const iPoint = find("point", "แต้ม", "คะแนน", "balance");
const iName = find("name", "ชื่อ");

if (iPhone < 0 || iPoint < 0) {
  console.error("หาคอลัมน์เบอร์โทรหรือแต้มไม่เจอ — หัวตารางที่อ่านได้:", head.join(" | "));
  process.exit(1);
}

const norm = (v) => {
  const d = String(v).replace(/\D/g, "");
  if (d.startsWith("66")) return "0" + d.slice(2);      // +66xxxxxxxxx → 0xxxxxxxxx
  return d.slice(-10);
};

let ok = 0, held = 0, skip = 0, fail = 0;

for (const r of rows) {
  const phone = norm(r[iPhone] || "");
  const points = Math.round(Number(String(r[iPoint] || "").replace(/[^0-9.-]/g, "")));
  if (!/^0\d{8,9}$/.test(phone) || !Number.isFinite(points) || points <= 0) { skip++; continue; }

  const res = await fetch(`${SITE}/api/points`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-key": key },
    body: JSON.stringify({
      action: "adjust",
      phone,
      n: points,
      note: "แต้มสะสมเดิมจากระบบเก่า",
    }),
  }).catch(() => null);

  const j = await res?.json().catch(() => null);
  if (!res?.ok || !j?.ok) { fail++; console.error(`  ✗ ${phone} — ${j?.error ?? "ยิงไม่สำเร็จ"}`); continue; }
  if (j.pending) held++; else ok++;
  process.stdout.write(`\r  ทำไปแล้ว ${ok + held + fail} / ${rows.length}`);
}

console.log(`\n
เสร็จแล้ว
  เข้าบัญชีทันที      ${ok} คน (สมัครไว้แล้ว)
  พักแต้มไว้ที่เบอร์   ${held} คน (จะเข้าเองตอนลูกค้าสมัคร/ล็อกอินครั้งแรก)
  ข้าม               ${skip} แถว (เบอร์ไม่ถูกต้องหรือแต้มเป็น 0)
  พลาด               ${fail} แถว`);
