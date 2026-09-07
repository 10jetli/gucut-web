// ทดสอบ core-returns.mjs กับ SQLite จริงในเครื่อง (D1 คือ SQLite ⇒ SQL ผิดจะโผล่ที่นี่)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { DB, coreQuery } from "./shim.mjs";
import * as R from "./mod.mjs";

fs.rmSync(DB, { force: true });
execFileSync("sqlite3", [DB, `
CREATE TABLE orders (id TEXT PRIMARY KEY, source TEXT, number TEXT, channel TEXT, status TEXT,
  amount REAL DEFAULT 0, customer TEXT, order_date TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE order_items (order_id TEXT, line INTEGER, sku TEXT, name TEXT,
  qty REAL DEFAULT 0, amount REAL DEFAULT 0, PRIMARY KEY (order_id, line));
CREATE TABLE stock_moves (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL, qty REAL NOT NULL,
  reason TEXT NOT NULL, ref TEXT, at TEXT DEFAULT (datetime('now')));
CREATE UNIQUE INDEX idx_moves_once ON stock_moves(reason,ref,sku);
INSERT INTO orders (id,source,number,customer) VALUES ('o1','zort','SO-001','ลูกค้าเอ');
INSERT INTO order_items VALUES ('o1',1,'SKU-A','ใบเลื่อย',3,300);
INSERT INTO order_items VALUES ('o1',2,'SKU-B','โซ่',2,500);
INSERT INTO orders (id,source,number,customer) VALUES ('o2','zort','SO-002','ลูกค้าบี');
INSERT INTO order_items VALUES ('o2',1,'SKU-A','ใบเลื่อย',1,100);
INSERT INTO orders (id,source,number,customer) VALUES ('o3','zort','SO-003','ลูกค้าซี');
INSERT INTO order_items VALUES ('o3',1,'SKU-C','คาร์บู',5,900);
`]);

const A = { id: "e1", name: "สมชาย" }, B = { id: "e2", name: "สมหญิง" };
let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`, extra !== undefined ? JSON.stringify(extra) : ""); }
};
const img = "data:image/jpeg;base64," + "A".repeat(200);

console.log("\n① ตัวตนพนักงาน");
ok((await R.receiveReturn({ orderId: "o1", items: [{ sku: "SKU-A", qty: 1 }] }, null)).error,
  "ไม่มี PIN = ปฏิเสธ");

console.log("\n② ขั้นรับ + ล็อกที่ใบขาย");
const r1 = await R.receiveReturn({ orderId: "o1", items: [{ sku: "SKU-A", qty: 2 }] }, A);
ok(r1.returnId && r1.state === "received", "สร้างใบได้ เซิร์ฟเวอร์ออก returnId", r1);
ok(r1.ref === "RT-SO-001", "ref = RT-<เลขใบขาย>", r1.ref);
ok(r1.remaining?.["SKU-A"] === 3, "remaining ก่อนลงบัญชี = ที่ขายไป", r1.remaining);

const r2 = await R.receiveReturn({ orderId: "o1", items: [{ sku: "SKU-A", qty: 1 }] }, B);
ok(r2.existing === true && r2.returnId === r1.returnId, "คนที่สองได้ใบเดิม ไม่สร้างใบซ้อน", r2);
ok(r2.lockedBy === "สมชาย", "บอกว่าใครถือใบอยู่", r2.lockedBy);
const r2b = await R.receiveReturn({ orderId: "o1", items: [{ sku: "SKU-A", qty: 1 }] }, A);
ok(r2b.existing === true && !r2b.lockedBy, "คนที่ถืออยู่เองไม่ถูกกัน", r2b);

console.log("\n③ บังคับรูปฝั่งเซิร์ฟเวอร์ (จอบังคับไม่พอ)");
const g0 = await R.gradeReturn({ returnId: r1.returnId, items: [{ sku: "SKU-A", verdict: "return_in" }] }, A);
ok(/รูป/.test(g0.error || ""), "ไม่มีรูป+ไม่มีเหตุผล = ปฏิเสธ", g0);
const p1 = await R.saveReturnPhoto({ returnId: r1.returnId, index: 0, dataUrl: img }, A);
ok(p1.stored === 1, "อัปรูปแล้วนับได้ 1", p1);
const p2 = await R.saveReturnPhoto({ returnId: r1.returnId, index: 0, dataUrl: img }, A);
ok(p2.stored === 1, "อัปทับ index เดิม ยอดไม่บวมเป็น 2", p2);

console.log("\n④ ประเมิน + ยิงเข้าสต็อกในคำขอเดียว");
const g1 = await R.gradeReturn({ returnId: r1.returnId, items: [{ sku: "SKU-A", verdict: "return_in" }] }, A);
ok(g1.state === "moved", "ทุกชิ้นลงบัญชี ⇒ moved", g1);
ok(g1.items?.[0]?.moveResult === "added", "moveResult รายชิ้น = added", g1.items);
ok(g1.remaining?.["SKU-A"] === 1, "remaining หักของที่คืนแล้ว (3-2=1)", g1.remaining);
const mv = await coreQuery(`SELECT reason,qty FROM stock_moves WHERE ref='RT-SO-001'`);
ok(mv.length === 1 && mv[0].reason === "return_in" && mv[0].qty === 2, "ของขายต่อได้ = บวกกลับแถวเดียว", mv);

console.log("\n⑤ ยิงซ้ำ (ชุดเดิม) ต้องไม่เบิ้ล");
const g2 = await R.gradeReturn({ returnId: r1.returnId, items: [{ sku: "SKU-A", verdict: "return_in" }] }, A);
ok(g2.state === "moved" && g2.items?.[0]?.moveResult === "duplicate", "ยิงซ้ำ = duplicate", g2.items);
const mv2 = await coreQuery(`SELECT COUNT(*) c, SUM(qty) s FROM stock_moves WHERE ref='RT-SO-001'`);
ok(mv2[0].c === 1 && mv2[0].s === 2, "บัญชีสต็อกไม่เบิ้ล", mv2);

console.log("\n⑥ เปลี่ยนคำตัดสินหลังลงบัญชีแล้ว = ปฏิเสธ");
const g3 = await R.gradeReturn({ returnId: r1.returnId, items: [{ sku: "SKU-A", verdict: "damage" }] }, A);
ok(/เปลี่ยนคำตัดสิน/.test(g3.error || ""), "กันสต็อกเพี้ยนจาก reason คนละตัว ref เดียวกัน", g3);

console.log("\n⑦ ใบรอบสองของใบขายเดิม");
const r3 = await R.receiveReturn({ orderId: "o1", items: [{ sku: "SKU-B", qty: 2 }] }, A);
ok(r3.ref === "RT-SO-001-2", "ref รอบสองต่างจากรอบแรก", r3.ref);

console.log("\n⑧ ของชำรุด — คืนเข้าแล้วตัดทิ้ง ผลสุทธิเป็นศูนย์");
await R.saveReturnPhoto({ returnId: r3.returnId, index: 0, dataUrl: img }, A);
const g4 = await R.gradeReturn({ returnId: r3.returnId, items: [{ sku: "SKU-B", verdict: "damage" }] }, A);
ok(g4.state === "moved", "ของชำรุดก็ปิดใบได้", g4);
const dm = await coreQuery(`SELECT reason,qty FROM stock_moves WHERE ref='RT-SO-001-2' ORDER BY reason`);
ok(dm.length === 2, "ของชำรุดลงสองแถว (คืนเข้า + ตัดทิ้ง)", dm);
ok(dm.reduce((s, r) => s + r.qty, 0) === 0, "ผลสุทธิต่อสต็อกที่ขายได้ = 0", dm);
ok(dm.some((r) => r.reason === "damage" && r.qty === -2), "มีแถว damage -2 ให้ตามหาของเสียได้", dm);

/* ⑨ ด่านโควตาที่ **ขั้นประเมิน** — คนละด่านกับที่ขั้นรับ (ข้อ ⑮)
   ด่านนี้มีไว้จับ "โลกเปลี่ยนระหว่างที่ใบยังค้างอยู่" ⇒ ต้องจำลองด้วยการทำให้โควตา
   หดลงหลังเปิดใบแล้ว **ไม่ใช่รับเกินตั้งแต่แรก** (แบบนั้นด่านขั้นรับจับไปก่อน
   แล้วด่านนี้จะไม่เคยถูกเรียกเลย — กับดัก [[test-must-hit-the-path]] เป๊ะ ๆ) */
console.log("\n⑨ คืนเกินจำนวนที่ขาย (ตรวจซ้ำตอนประเมิน)");
const r4 = await R.receiveReturn({ orderId: "o2", items: [{ sku: "SKU-A", qty: 1 }] }, A);
ok(r4.returnId && !r4.overQuota, "รับในโควตาได้ปกติ", r4);
await R.saveReturnPhoto({ returnId: r4.returnId, index: 0, dataUrl: img }, A);
// จำลอง: มีอีกทางหนึ่งยืนยันคืน SKU-A ของใบขาย o2 ไปแล้ว ⇒ โควตาหมดระหว่างที่ใบนี้ค้าง
await coreQuery(`INSERT INTO returns_desk (return_id,ref,state,unmatched,order_id)
  VALUES ('ghost','RT-GHOST','moved',0,'o2')`);
await coreQuery(`INSERT INTO returns_desk_items (return_id,line,sku,qty,verdict,move_result)
  VALUES ('ghost',1,'SKU-A',1,'return_in','added')`);
const g5 = await R.gradeReturn({ returnId: r4.returnId, items: [{ sku: "SKU-A", verdict: "return_in" }] }, A);
ok(Array.isArray(g5.over) && g5.over.length === 1, "โควตาหมดระหว่างทาง = ปฏิเสธพร้อมตัวเลข", g5);
const none = await coreQuery(`SELECT COUNT(*) c FROM stock_moves WHERE ref='${r4.ref}'`);
ok(none[0].c === 0, "ปฏิเสธแล้วต้องไม่ลงบัญชีแม้แถวเดียว", none);

/* ⑩ SKU ซ้ำในใบเดียว
   ⚠️ **ต้องเป็นใบขายที่ยังไม่มีใบคืนค้าง** ไม่งั้น receiveReturn จะคืน "ใบเดิม"
      แล้วโค้ดรวมบรรทัดไม่เคยถูกเรียกเลย — ข้อนี้เคยเขียนผิดแบบนั้นและ**ผ่านเขียว**
      ทั้งที่ถอดตัวรวมออกจากโค้ดจริงแล้ว (จับได้ตอนป้อนของเสียเข้าไปทดสอบตัวทดสอบ) */
console.log("\n⑩ SKU ซ้ำในใบเดียว ต้องรวมจำนวน");
const r5 = await R.receiveReturn(
  { orderId: "o3", items: [{ sku: "SKU-C", qty: 1 }, { sku: "SKU-C", qty: 2 }] }, A);
ok(!r5.existing && r5.returnId, "ใบขายใหม่ = ได้ใบใหม่จริง (ไม่ใช่ใบเดิม)", r5);
const lines = await coreQuery(`SELECT COUNT(*) c, SUM(qty) s FROM returns_desk_items WHERE return_id='${r5.returnId}'`);
ok(lines[0].c === 1 && lines[0].s === 3, "หนึ่ง SKU = หนึ่งบรรทัด และจำนวนรวมครบ", lines);
await R.saveReturnPhoto({ returnId: r5.returnId, index: 0, dataUrl: img }, A);
const g6 = await R.gradeReturn({ returnId: r5.returnId, items: [{ sku: "SKU-C", verdict: "return_in" }] }, A);
const mvC = await coreQuery(`SELECT SUM(qty) s FROM stock_moves WHERE ref='${r5.ref}'`);
ok(g6.state === "moved" && mvC[0].s === 3, "ของเข้าคลังครบ 3 ไม่ใช่ 1 (ดัชนี UNIQUE จะกลืนบรรทัดซ้ำ)", mvC);

console.log("\n⑪ ใบที่หาใบขายไม่เจอ (unmatched)");
const u1 = await R.receiveReturn({ unmatched: true, unmatchedNote: "ลูกค้าไม่มีใบเสร็จ", items: [{ name: "โซ่ไม่รู้รุ่น", qty: 1 }] }, A);
ok(u1.quarantineNo === "Q-000001", "ได้เลขกักเรียงลำดับ (ช่องว่างประกาศตัวเอง)", u1);
const u2 = await R.receiveReturn({ unmatched: true, items: [{ name: "บาร์", qty: 1 }] }, A);
ok(u2.quarantineNo === "Q-000002", "เลขถัดไปเดินต่อ", u2);
await R.saveReturnPhoto({ returnId: u1.returnId, index: 0, dataUrl: img }, A);
const gu = await R.gradeReturn({ returnId: u1.returnId, items: [{ sku: "X", verdict: "return_in" }] }, A);
ok(/ผูก/.test(gu.error || ""), "ใบ unmatched เข้าสต็อกไม่ได้จนกว่าแอดมินผูกใบ", gu);

console.log("\n⑫ รับช่วงใบ");
const t0 = await R.takeoverReturn({ returnId: r4.returnId, reason: "other" }, B);
ok(/เหตุผล/.test(t0.error || ""), 'เลือก "อื่น ๆ" ต้องพิมพ์เหตุผล', t0);
const t1 = await R.takeoverReturn({ returnId: r4.returnId, reason: "shift-change" }, B);
ok(t1.doc?.lockedBy === "สมหญิง", "ล็อกย้ายมาที่คนใหม่", t1.doc?.lockedBy);
ok(t1.doc?.takeovers?.length === 1 && t1.doc.takeovers[0].from === "สมชาย",
  "การรับช่วงถูกบันทึกเป็นรายการแยก ไม่ใช่แย่งเงียบ ๆ", t1.doc?.takeovers);

console.log("\n⑬ กล่องใบคืน");
const inbox = await R.listReturnsInbox({});
ok(inbox.total >= 5 && Array.isArray(inbox.rows), "กล่องอ่านได้", inbox.total);
ok(!("reconHeartbeatAt" in inbox), "ไม่มีงานเทียบจริง ⇒ ไม่ส่ง heartbeat ปลอมให้จอเขียว");
const found = await R.listReturnsInbox({ q: "SO-001" });
ok(found.rows.length >= 2, "ค้นด้วยเลขใบขายเจอ", found.rows.length);


console.log("\n⑭ ล็อกต้องกันทุกประตู ไม่ใช่แค่ประตูแรก");
const L = await R.receiveReturn({ orderId: "o2", items: [{ sku: "SKU-A", qty: 1 }] }, A);
// (o2 มีใบค้างจากข้อ ⑨ อยู่แล้ว — ใช้ใบนั้น) ล็อกอยู่กับสมหญิงจากข้อ ⑫
const lockedId = r4.returnId;
const pB = await R.saveReturnPhoto({ returnId: lockedId, index: 5, dataUrl: img }, A);
ok(pB.blocked === true && pB.lockedBy === "สมหญิง", "แนบรูปโดยคนที่ไม่ได้ถือใบ = ถูกกัน", pB);
const gB = await R.gradeReturn({ returnId: lockedId, items: [{ sku: "SKU-A", verdict: "return_in" }] }, A);
ok(gB.blocked === true && gB.lockedBy === "สมหญิง", "ประเมินโดยคนที่ไม่ได้ถือใบ = ถูกกัน (รูที่ฝั่งจอจับได้)", gB);
ok(!gB.state, "ถูกกันแล้วต้องไม่มี state ติดกลับไป (จอจะได้ไม่นึกว่าสำเร็จ)", gB);

console.log("\n⑮ โควตาต้องกันตั้งแต่ขั้นรับ ไม่ใช่ไปตกที่ขั้นประเมิน");
const q1 = await R.receiveReturn({ orderId: "o3", items: [{ sku: "SKU-C", qty: 99 }] }, A);
ok(q1.overQuota === true && Array.isArray(q1.over), "รับเกินโควตา = ตีกลับพร้อมตัวเลข", q1);
ok(!q1.returnId, "ตีกลับแล้วต้องไม่เกิดใบทางตัน", q1);
const stuck = await coreQuery(`SELECT COUNT(*) c FROM returns_desk WHERE order_id='o3' AND state IN ('received','graded','move_failed')`);
ok(stuck[0].c === 0, "ไม่มีใบเปิดค้างของ o3 หลงเหลือ", stuck);

console.log("\n⑯ ยกเลิกใบ");
const c0 = await R.cancelReturn({ returnId: r1.returnId, reason: "ทดสอบ" }, A);
ok(/ลงบัญชี/.test(c0.error || ""), "ใบที่ของเข้าคลังแล้ว ยกเลิกไม่ได้", c0);
const c1 = await R.cancelReturn({ returnId: lockedId }, B);
ok(/เหตุผล/.test(c1.error || ""), "ต้องบอกเหตุผล", c1);
const c2 = await R.cancelReturn({ returnId: lockedId, reason: "ลูกค้าเปลี่ยนใจ" }, A);
ok(c2.blocked === true, "คนที่ไม่ได้ถือใบยกเลิกไม่ได้ (ต้อง takeover ก่อน)", c2);
const c3 = await R.cancelReturn({ returnId: lockedId, reason: "ลูกค้าเปลี่ยนใจ" }, B);
ok(c3.doc?.state === "cancelled" && c3.doc?.cancelReason === "ลูกค้าเปลี่ยนใจ", "คนถือใบยกเลิกได้ พร้อมบันทึกเหตุผล", c3.doc);
const reopen = await R.receiveReturn({ orderId: "o2", items: [{ sku: "SKU-A", qty: 1 }] }, A);
ok(!reopen.existing, "ยกเลิกแล้วใบขายนั้นไม่ถูกล็อกค้างอีก (เปิดใบใหม่ได้ ไม่ค้างตลอดกาล)", reopen);
ok(reopen.overQuota === true, "…แต่ยังโดนด่านโควตาตามปกติ (o2 ถูกคืนไปหมดแล้ว)", reopen);

console.log(`\n${fail ? "🔴" : "✅"} ผ่าน ${pass} · ตก ${fail}`);
process.exit(fail ? 1 : 0);
