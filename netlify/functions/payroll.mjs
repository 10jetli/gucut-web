// /api/payroll — เงินเดือนพนักงาน (หลังร้านเท่านั้น)
//
// ท่านประธานสั่ง 1 ต.ค. 2569 · เงินเดือนรายเดือนคงที่ · ธนาคารกสิกรไทย
//
// 🔴 **ทุกเส้นต้องผ่าน admin-gate ไม่มียกเว้น**
//    ในนี้มีเงินเดือนกับเลขบัญชีธนาคารของพนักงานทุกคน
//    ⚠️ `adminGate` คืนออบเจกต์ `{ wants, ok, deny }` **ไม่ใช่ Response**
//       เขียน `if (gate) return gate` ไม่ได้ (ออบเจกต์เป็นจริงเสมอ)
//       → Netlify ตอบ "Function returned an unsupported value" ทุกคำขอ
//       และ `tsc`/`npm run build` **มองไม่เห็น** เพราะไฟล์นี้เป็น .mjs
//       (เคยพลาดมาแล้ว 25 ส.ค. 2569 ⇒ เพิ่มเส้นใหม่ต้องยิงของจริงหลัง deploy เสมอ)
//
// 🔴 **ไม่มีเส้นไหนในไฟล์นี้ที่โอนเงินได้** — ออกได้แค่ไฟล์ให้คนเอาไปอัปโหลดเอง
//    ถ้าวันหนึ่งมีคนจะเพิ่มเส้น "โอนจริง" ให้ถามท่านประธานก่อนเสมอ
//    และต้องมีขั้นยืนยันของมนุษย์คั่นอยู่ด้วยทุกกรณี
import { adminGate } from "../lib/admin-gate.mjs";
import { วันนี้ไทย } from "../lib/thaiday.mjs";
import {
  buildMonth, readPay, saveAdj, savePay, slipText, toBaht, transferCsv,
} from "../lib/payroll.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/* ⏰ เดือนแบบไทย `yyyy-mm` — **ใช้แหล่งกลาง ห้ามบวก 7 เอง**
   🔴 ใบนี้เดิมเขียน `Date.now() + 7 * 3600 * 1000` เอง ⇒ ชนเพดานด่าน
      `check-thai-offset-copies` (46 > 45) ⇒ **push ถูกตีกลับทั้งใบ** (2 ต.ค. 2569)
   🔑 เหตุที่กองนี้มีเพดาน: บั๊ก `orderdate` เคยเกิดในไฟล์ที่ **มีตัวบวก 7 ของตัวเองอยู่แล้ว**
   ✅ แหล่งกลาง `วันนี้ไทย()` ให้ `yyyy-mm-dd` อยู่แล้ว ⇒ ตัด 7 ตัวแรกได้ตรง ๆ
      พิสูจน์ว่าผลเท่ากันก่อนแก้ (รวมรอยต่อเดือน UTC 31 ส.ค. 18:00 = ไทย 1 ก.ย. ⇒ ได้ `2026-09` ทั้งคู่) */
const เดือนนี้ = () => วันนี้ไทย().slice(0, 7);

/** แปลงสตางค์เป็นบาทให้ฝั่งจอ — จอไม่ต้องรู้เรื่องสตางค์ */
const แต่งแถว = (r) => ({
  ...r,
  salary: toBaht(r.salarySatang),
  add: toBaht(r.addSatang),
  cut: toBaht(r.cutSatang),
  net: toBaht(r.netSatang),
});

export default async function handler(req, context) {
  const url = new URL(req.url);

  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  const month = url.searchParams.get("month") || เดือนนี้();

  try {
    // ── ไฟล์โอนเงินเป็นชุด ────────────────────────────────────────────────
    if (req.method === "GET" && url.searchParams.get("csv")) {
      const data = await buildMonth(month);
      if (!data.countReady)
        return json({ error: "ยังไม่มีพนักงานที่พร้อมโอนสักคน — ตรวจเลขบัญชีและเงินเดือนก่อน" }, 400);
      return new Response(transferCsv(data), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="salary-${month}.csv"`,
          "cache-control": "no-store",
        },
      });
    }

    // ── สลิปรายคน ─────────────────────────────────────────────────────────
    if (req.method === "GET" && url.searchParams.get("slip")) {
      const id = url.searchParams.get("slip");
      const { rows } = await buildMonth(month);
      const row = rows.find((r) => r.id === id);
      if (!row) return json({ error: "ไม่พบพนักงานคนนี้ในเดือนที่เลือก" }, 404);
      return json({ ok: true, month, slip: slipText(row, month), row: แต่งแถว(row) });
    }

    // ── อ่านข้อมูลรายคน (ตอนเปิดฟอร์มแก้) ──────────────────────────────────
    // ⚠️ ต้องอยู่ **ก่อน** เส้นสรุปทั้งเดือน — เส้นนั้นรับ GET ทุกแบบ
    //    วางสลับกันเมื่อไหร่ เส้นนี้จะไม่มีวันถูกเรียก และ **ไม่มี error ให้เห็น**
    //    ฝั่งจอจะได้สรุปทั้งเดือนกลับไปแทน ซึ่งหน้าตาเหมือนคำตอบที่ถูกต้อง
    if (req.method === "GET" && url.searchParams.get("emp")) {
      const rec = await readPay(url.searchParams.get("emp"));
      return json({ ok: true, pay: rec ? { ...rec, salary: toBaht(rec.salary) } : null });
    }

    // ── สรุปทั้งเดือน ─────────────────────────────────────────────────────
    if (req.method === "GET") {
      const data = await buildMonth(month);
      return json({
        ok: true,
        month,
        rows: data.rows.map(แต่งแถว),
        total: toBaht(data.totalSatang),
        countReady: data.countReady,
        // 🔑 บอกฝั่งจอตรง ๆ ว่าระบบนี้ไม่โอนเงินให้ — จอจะได้ไม่เขียนปุ่มที่ทำให้เข้าใจผิด
        transfersMoney: false,
        csvNote: "รูปแบบไฟล์ยังไม่ได้ยืนยันกับเทมเพลตจริงของ K BIZ — ใช้ตรวจยอดได้ แต่ก่อนอัปโหลดจริงให้เทียบกับเทมเพลตของธนาคารก่อน",
      });
    }

    // ── ตั้งเงินเดือน/บัญชีรายคน ───────────────────────────────────────────
    if (req.method === "POST" && url.searchParams.get("emp")) {
      const body = await req.json().catch(() => ({}));
      const rec = await savePay(url.searchParams.get("emp"), body);
      // ⚠️ ไม่ส่งเลขบัญชีเต็มกลับไป — คืนแค่ว่าบันทึกติดแล้ว
      return json({ ok: true, saved: { salary: toBaht(rec.salary), accLast4: rec.acc.slice(-4) } });
    }

    // ── บันทึกรายการเพิ่ม/หักของเดือน ──────────────────────────────────────
    if (req.method === "POST" && url.searchParams.get("adj")) {
      const body = await req.json().catch(() => ({}));
      const rec = await saveAdj(month, url.searchParams.get("adj"), body);
      return json({ ok: true, saved: { add: toBaht(rec.add), cut: toBaht(rec.cut) } });
    }

  } catch (e) {
    return json({ error: e?.message || "ทำรายการไม่สำเร็จ" }, e?.status || 500);
  }

  return json({ error: "ไม่รู้จักคำสั่งนี้" }, 400);
}

export const config = { path: "/api/payroll" };
