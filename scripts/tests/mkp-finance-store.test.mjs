/* ด่านของกระจกการเงินมาร์เก็ตเพลส (ใบ t_mu5bxe47)
 *
 * 🔴 เรื่องที่เฝ้า และทำไมแต่ละข้อสำคัญ
 *  ① **กุญแจของ Lazada ต้องมี fee_name** — วัดของจริง 800 แถว: txn_number เดียวไม่ซ้ำแค่ 173/800
 *     ⇒ ถ้ากุญแจแคบ ค่าธรรมเนียม 5 บรรทัด/ออเดอร์ยุบเหลือ 1 ⇒ ยอดต่ำกว่าจริง ~78% **เงียบสนิท**
 *  ② **ต้องฟ้องเองเมื่อกุญแจแคบเกิน** — ตัวอย่าง 800 แถวไม่ใช่ทั้งชุด ⇒ ของจริงต้องร้องได้
 *  ③ **grain ที่ไม่รู้จัก ต้องตีกลับ ห้ามเดาลงตารางใดตารางหนึ่ง**
 *  ④ **ห้ามมีคอลัมน์ที่รับข้อมูลส่วนบุคคล** (repo เป็น PUBLIC)
 *  ⑤ **จำนวนตัวแปรผูกค่าต่อคำสั่งต้องไม่เกิน 100** (เพดานของ D1 — ไม่ใช่ 999 แบบ SQLite)
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const คำสั่งที่ยิง = [];
let แถวในฐาน = 0;
mock.module("../../netlify/lib/coredb.mjs", { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, args = []) => {
    คำสั่งที่ยิง.push({ sql, n: args.length });
    if (/COUNT\(\*\)/.test(sql)) return [{ n: แถวในฐาน }];
    if (/^INSERT/.test(sql.trim())) แถวในฐาน += 1;   // จำลองว่าเพิ่มบ้าง (ค่าจริงไม่สำคัญกับด่านนี้)
    return [];
  },
}});
const { ตาราง, ตารางของ, เขียนการเงิน } = await import("../../netlify/lib/mkp-finance-store.mjs");

const feeRow = (txn, name, amt) => ({
  id: txn, feeName: name, day: "2026-09-18", dayRaw: "18 Sep 2026", type: "1",
  feeType: "16", feeLineAmount: amt, vatIn: 0, wht: 0,
  orderRef: "o1", orderItemRef: txn, statement: "18 Sep 2026 - 18 Sep 2026", paidStatus: "paid",
});

test("① กุญแจของตารางค่าธรรมเนียมต้องมีช่องชื่อค่าธรรมเนียม ไม่ใช่เลขธุรกรรมเดียว", () => {
  const k = ตาราง.mkp_fee_line.กุญแจ;
  assert.ok(k.length >= 2, "กุญแจช่องเดียวจะทำให้ค่าธรรมเนียมหลายบรรทัดต่อออเดอร์ยุบเป็นแถวเดียว");
  assert.ok(k.includes("fee_name"), "ต้องมี fee_name ในกุญแจ (วัดจริง 800 แถว: ไม่มีแล้วเหลือ 173/800)");
});

test("① ห้ามตั้งชื่อคอลัมน์ว่า id ในตารางค่าธรรมเนียม — ชื่อนั้นทำให้คนเชื่อว่าไม่ซ้ำ", () => {
  assert.ok(!("id" in ตาราง.mkp_fee_line.คอลัมน์), "ใช้ชื่อ txn_number แทน เพราะค่านั้นซ้ำได้จริง");
});

test("② ห้าขาย 5 บรรทัดของออเดอร์เดียว ต้องเขียนได้ครบ ไม่ยุบ", async () => {
  แถวในฐาน = 0; คำสั่งที่ยิง.length = 0;
  const rows = ["Commission", "Payment Fee", "Item Price Credit", "LazCoins Discount", "Premium Package"]
    .map((n, i) => feeRow("111", n, -i - 1));
  const r = await เขียนการเงิน("fee-line", rows);
  assert.equal(r.รับมา, 5);
  assert.equal(r.ยุบ, 0, "คู่กุญแจต่างกันทั้ง 5 แถว ⇒ ต้องไม่ยุบ");
  assert.ok(!r["🔴 กุญแจแคบเกิน"], "ไม่ควรฟ้องเมื่อไม่มีการยุบ (ด่านที่ร้องใส่ของปกติจะถูกปิดใน 1 วัน)");
});

test("② คู่กุญแจซ้ำจริง ⇒ ต้องฟ้อง ไม่ใช่เขียนทับเงียบ ๆ", async () => {
  แถวในฐาน = 0;
  /* ⚠️ นี่คือเคสที่จะเกิดถ้าวันหนึ่ง Lazada ส่งชื่อค่าธรรมเนียมซ้ำในออเดอร์เดียว
     ⇒ ตัวอย่าง 800 แถวไม่เจอ **แต่ไม่ได้พิสูจน์ว่าไม่มี** ⇒ ของจริงต้องร้องได้เอง */
  const r = await เขียนการเงิน("fee-line", [feeRow("222", "Commission", -1), feeRow("222", "Commission", -9)]);
  assert.equal(r.ยุบ, 1, "สองแถวคู่กุญแจเดียวกัน ⇒ ยุบ 1");
  assert.ok(r["🔴 กุญแจแคบเกิน"], "ต้องฟ้องออกมาให้คนเห็น ไม่ใช่ทับกันเงียบ");
});

test("③ grain ที่ไม่รู้จัก ⇒ ตีกลับ ห้ามเดาลงตารางใดตารางหนึ่ง", async () => {
  const r = await เขียนการเงิน("ของใหม่ที่ไม่รู้จัก", [feeRow("1", "Commission", -1)]);
  assert.ok(r.error, "ต้องคืน error");
  assert.match(r.error, /ไม่รู้จัก/, "ต้องบอกว่าไม่รู้จัก grain นี้");
});

test("③ กุญแจว่าง ⇒ ตีกลับแถวนั้น ห้ามใส่ค่าแทน", async () => {
  แถวในฐาน = 0;
  const r = await เขียนการเงิน("fee-line", [feeRow("333", null, -1), feeRow("333", "Commission", -2)]);
  assert.equal(r.ขาดกุญแจ, 1, "แถวที่ชื่อค่าธรรมเนียมว่าง ต้องถูกตีกลับ");
  assert.equal(r.รับมา, 2);
});

test("④ ห้ามมีคอลัมน์ที่รับข้อมูลส่วนบุคคล (repo เป็น PUBLIC)", () => {
  const ห้าม = /buyer|customer|name$|phone|address|detail|comment|description|remark|reason/i;
  for (const [ชื่อ, t] of Object.entries(ตาราง)) {
    for (const c of Object.keys(t.คอลัมน์)) {
      /* `fee_name` เป็นชื่อประเภทค่าธรรมเนียม ไม่ใช่ชื่อคน ⇒ ยกเว้นแบบระบุชัด ไม่ใช่ปล่อยทั้งรูป */
      if (c === "fee_name") continue;
      assert.ok(!ห้าม.test(c), `${ชื่อ}.${c} ชื่อคล้ายช่องข้อมูลส่วนบุคคล — ตรวจก่อนว่าไม่ใช่`);
    }
  }
});

test("⑤ ตัวแปรผูกค่าต่อคำสั่งต้องไม่เกินเพดาน D1 (100)", async () => {
  แถวในฐาน = 0; คำสั่งที่ยิง.length = 0;
  const rows = Array.from({ length: 40 }, (_, i) => feeRow(String(i), "Commission", -1));
  await เขียนการเงิน("fee-line", rows);
  const inserts = คำสั่งที่ยิง.filter((c) => /^INSERT/.test(c.sql.trim()));
  assert.ok(inserts.length > 1, "40 แถวต้องถูกแบ่งหลายคำสั่ง");
  for (const c of inserts) {
    assert.ok(c.n <= 100, `คำสั่งหนึ่งใช้ตัวแปร ${c.n} ตัว เกินเพดาน D1 (100) — SQLite ในเครื่องยอมถึง 999 จึงไม่ฟ้อง`);
  }
});

test("ทุกตารางต้องประกาศ grain และจับคู่กลับได้", () => {
  for (const [ชื่อ, t] of Object.entries(ตาราง)) {
    assert.ok(t.grain, `${ชื่อ} ต้องมี grain`);
    assert.equal(ตารางของ(t.grain), ชื่อ, "grain ต้องชี้กลับมาที่ตารางเดิม");
  }
});

/* 🧪 ปลูกบั๊กพิสูจน์แล้ว 19 ก.ย. 2569:
 *    ถอด fee_name ออกจากกุญแจ   ⇒ แดง 2 ข้อ (ข้อ ① และ ② เพราะ 5 บรรทัดยุบเหลือ 1)
 *    เพิ่มคอลัมน์ buyer_name     ⇒ แดง (ข้อ ④)
 *    ตั้งแถวต่อคำสั่งเป็น 40     ⇒ แดง (ข้อ ⑤ · 40 × 14 = 560 ตัวแปร)
 */
