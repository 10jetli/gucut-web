/* 🏦 กระจกธุรกรรมการเงินมาร์เก็ตเพลส → D1 — **สามตาราง ไม่ใช่ตารางเดียว**
 *   ใบกระดาน t_mu5bxe47 · เขียน 19 ก.ย. 2569
 *
 * 🔴 **ทำไมต้องสามตาราง** — สามเจ้าให้ข้อมูล *คนละระดับ* จริง (พิสูจน์ด้วยการยิงจริง)
 *    shopee `wallet-txn`  = รายการเดินบัญชีกระเป๋าเงิน (มี balanceAfter · ทิศทางเงินแยกช่อง)
 *    lazada `fee-line`    = ค่าธรรมเนียม **รายบรรทัด** (หนึ่งออเดอร์มีหลายแถว)
 *    tiktok `statement`   = ใบสรุปรอบโอนเงิน (ค่าธรรมเนียมแยกช่องมาแล้ว)
 *    ⇒ ยัดตารางเดียว = วันหนึ่งจะมีคน `SUM()` ข้ามเจ้า แล้วได้ตัวเลขที่ไม่มีความหมาย
 *      โดยไม่มีอะไรฟ้อง เพราะทุกแถวเป็นตัวเลขที่ถูกต้องของตัวเอง
 *    🚫 และจอ **ห้ามมีช่อง "รวมทั้งหมด"** แม้แต่ช่องเดียว (ฝั่งจอเสนอ ผมเห็นด้วย)
 *
 * 🔴🔴 **กุญแจของ Lazada ไม่ใช่ `transaction_number` ตัวเดียว — วัดแล้ว ไม่ได้เดา**
 *    ยิงของจริง 800 แถว (30 วัน) แล้วนับ:
 *      `transaction_number` เดียว    ⇒ ไม่ซ้ำเพียง **173 / 800**  (ซ้ำ 153 กลุ่ม)
 *      `transaction_number + feeName` ⇒ ไม่ซ้ำ **800 / 800** ✅
 *    ⇒ ถ้าตั้ง PK เป็น id เดียว **ค่าธรรมเนียม 5 บรรทัดต่อออเดอร์จะยุบเหลือ 1 แถว**
 *      เสียไป ~78% ของแถว **แบบเงียบสนิท** แล้วยอดค่าธรรมเนียมจะต่ำกว่าจริงหลายเท่า
 *    ⚠️ และ 800 แถวยังเป็น **ตัวอย่าง** ไม่ใช่ทั้งชุด ⇒ จึงมีด่านนับตอนเขียนด้วย (ดู `ยุบ` ข้างล่าง)
 *       "วัดแล้วไม่ซ้ำในตัวอย่าง" ไม่ใช่ "ไม่ซ้ำแน่นอน" — ต้องให้ของจริงฟ้องได้เองด้วย
 *
 * ⚠️ **ชื่อ `transaction_number` ของ Lazada ไม่ใช่เลขประจำตัวของธุรกรรม**
 *    บางแถวเท่ากับเลขรายการสินค้าในออเดอร์ บางแถวไม่เท่า (วัดแล้ว: ไม่เท่ากันทุกแถว)
 *    ⇒ ตั้งชื่อคอลัมน์ว่า `txn_number` **ห้ามตั้งว่า `id`** ไม่งั้นคนอ่านจะเชื่อว่ามันไม่ซ้ำ
 *
 * 🔒 **ข้อมูลส่วนบุคคล** — ตัวนี้เขียนเฉพาะช่องที่ `mkp-finance.mjs` คัดมาแล้ว (allowlist)
 *    🚫 ห้ามเพิ่มคอลัมน์รับ `buyer_name` · `details` · `comment` · `description` เด็ดขาด
 *    repo เป็น PUBLIC และแถวในฐานถูกดึงขึ้นจอ/ลง log ได้
 *
 * ⚠️ เขียนแบบ **upsert** (มีอยู่แล้วให้ทับค่าใหม่) เพราะแพลตฟอร์มแก้ตัวเลขย้อนหลังได้
 *    (เหตุเดียวกับที่ตัวส่งค่าโฆษณา Google ต้อง "แทนที่แถวของวันเดิม ไม่ใช่บวกเพิ่ม")
 * ⚠️ D1 รับตัวแปรผูกค่าไม่เกิน **100 ตัวต่อคำสั่ง** (ไม่ใช่ 999 แบบ SQLite ปกติ)
 *    ⇒ คิดจำนวนแถวต่อคำสั่งจากจำนวนคอลัมน์จริงเสมอ ห้ามตั้งเลขตายตัว
 */
import { coreQuery, coreReady } from "./coredb.mjs";

/* คอลัมน์ของแต่ละตาราง — **ลำดับสำคัญ** ใช้สร้างทั้ง CREATE และ INSERT จากที่เดียว
   🔑 เขียนที่เดียวกันทั้งสองอย่าง ⇒ เพิ่มคอลัมน์แล้วลืมแก้ INSERT เป็นไปไม่ได้
      (เคยกัดทีมมาแล้ว: เพิ่มคอลัมน์แล้ว SELECT ก่อน ALTER ถูกยิงจริง ⇒ จอล่ม) */
export const ตาราง = {
  mkp_wallet_txn: {
    platform: "shopee",
    grain: "wallet-txn",
    กุญแจ: ["txn_id"],
    คอลัมน์: {
      txn_id: "TEXT", day: "TEXT", type: "TEXT", flow: "TEXT",
      wallet_amount: "REAL", balance_after: "REAL",
      order_ref: "TEXT", refund_ref: "TEXT", status: "TEXT", synced_at: "TEXT",
    },
    จากแถว: (r) => [r.id, r.day, r.type, r.flow, r.walletAmount, r.balanceAfter, r.orderRef, r.refundRef, r.status],
  },
  mkp_fee_line: {
    platform: "lazada",
    grain: "fee-line",
    /* 🔴 กุญแจสองช่อง — วัดแล้วว่า txn_number เดียวไม่พอ (173/800) ดูหัวไฟล์ */
    กุญแจ: ["txn_number", "fee_name"],
    คอลัมน์: {
      txn_number: "TEXT", fee_name: "TEXT", day: "TEXT", day_raw: "TEXT", type: "TEXT",
      fee_type: "TEXT", fee_line_amount: "REAL", vat_in: "REAL", wht: "REAL",
      order_ref: "TEXT", order_item_ref: "TEXT", statement: "TEXT", paid_status: "TEXT", synced_at: "TEXT",
    },
    จากแถว: (r) => [r.id, r.feeName, r.day, r.dayRaw, r.type, r.feeType, r.feeLineAmount,
      r.vatIn, r.wht, r.orderRef, r.orderItemRef, r.statement, r.paidStatus],
  },
  mkp_statement: {
    platform: "tiktok",
    grain: "statement",
    กุญแจ: ["statement_id"],
    คอลัมน์: {
      statement_id: "TEXT", day: "TEXT", paid_day: "TEXT", currency: "TEXT",
      settlement: "REAL", revenue: "REAL", net_sales: "REAL", fee: "REAL",
      shipping_cost: "REAL", adjustment: "REAL",
      payment_status: "TEXT", payment_ref: "TEXT", synced_at: "TEXT",
    },
    จากแถว: (r) => [r.id, r.day, r.paidDay, r.currency, r.settlement, r.revenue, r.netSales,
      r.fee, r.shippingCost, r.adjustment, r.paymentStatus, r.paymentRef],
  },
};

/** ตารางของ grain นั้น — คืน null เมื่อไม่รู้จัก (ห้ามเดาลงตารางใดตารางหนึ่ง) */
export function ตารางของ(grain) {
  for (const [ชื่อ, t] of Object.entries(ตาราง)) if (t.grain === grain) return ชื่อ;
  return null;
}

export async function สร้างตารางการเงิน() {
  for (const [ชื่อ, t] of Object.entries(ตาราง)) {
    const cols = Object.entries(t.คอลัมน์).map(([c, ชนิด]) => `${c} ${ชนิด}`).join(", ");
    await coreQuery(`CREATE TABLE IF NOT EXISTS ${ชื่อ} (${cols}, PRIMARY KEY (${t.กุญแจ.join(", ")}))`);
    /* ดัชนีวัน — ทุกจอถามเป็นช่วงวันทั้งนั้น */
    await coreQuery(`CREATE INDEX IF NOT EXISTS ${ชื่อ}_day ON ${ชื่อ} (day)`);
  }
}

/** เขียนแถวลงตารางของ grain นั้น — คืนจำนวนที่รับมา/เขียนได้ และ **จำนวนที่ยุบ**
 *  🔑 `ยุบ` = แถวที่รับมาแต่ไม่ได้เพิ่มจำนวนแถวในฐานและไม่ใช่การอัปเดตซ้ำรอบเดิม
 *     ⇒ เป็นสัญญาณว่า **กุญแจแคบเกิน** ซึ่งเป็นความผิดพลาดที่เงียบที่สุดของงานนี้
 *     ⚠️ ต้องนับจากฐานจริง (นับแถวก่อน/หลัง) **ห้ามอนุมานจากจำนวนที่ส่งไป** */
export async function เขียนการเงิน(grain, rows, { now = new Date().toISOString() } = {}) {
  const ชื่อ = ตารางของ(grain);
  if (!ชื่อ) return { error: `ไม่รู้จัก grain "${grain}" ⇒ ไม่เขียนลงตารางไหนเลย (เดาแล้วข้อมูลไปผิดตาราง)` };
  const t = ตาราง[ชื่อ];
  const cols0 = Object.keys(t.คอลัมน์);
  /* 🔑 ดึงค่าช่องกุญแจจากแถว โดยอ้าง **ตำแหน่งคอลัมน์จริง** ไม่ใช่เดาชื่อฟิลด์ฝั่งต้นทาง
     (ชื่อต้นทางกับชื่อคอลัมน์ไม่ตรงกันโดยตั้งใจ เช่น `id` → `txn_number`) */
  const ค่ากุญแจ = (r) => t.กุญแจ.map((k) => t.จากแถว(r)[cols0.indexOf(k)]);
  /* ⚠️ กุญแจว่าง = เขียนไม่ได้ (PK ห้ามว่าง) ⇒ **ตีกลับ ไม่ใช่ใส่ค่าแทน**
     ใส่ค่าแทนคือการแต่งข้อมูล และจะไปทับแถวอื่นที่ถูกแต่งด้วยค่าเดียวกัน */
  const ใช้ได้ = (rows || []).filter((r) => r && ค่ากุญแจ(r).every((v) => v !== null && v !== undefined && v !== ""));
  const ขาดกุญแจ = (rows || []).length - ใช้ได้.length;
  if (!ใช้ได้.length) return { ตาราง: ชื่อ, รับมา: (rows || []).length, ขาดกุญแจ, เขียน: 0, ยุบ: 0 };

  const cols = Object.keys(t.คอลัมน์);
  const ต่อคำสั่ง = Math.max(1, Math.floor(90 / cols.length));
  /* 🔢 นับแถวก่อน/หลังจากฐานจริง — ตัวเดียวที่บอกได้ว่ามีแถวหายไปกับกุญแจ */
  const [ก่อน] = await coreQuery(`SELECT COUNT(*) AS n FROM ${ชื่อ}`);
  let ส่งไป = 0;
  for (let i = 0; i < ใช้ได้.length; i += ต่อคำสั่ง) {
    const ก้อน = ใช้ได้.slice(i, i + ต่อคำสั่ง);
    const ค่า = [];
    for (const r of ก้อน) ค่า.push(...t.จากแถว(r), now);
    const ช่อง = `(${cols.map(() => "?").join(",")})`;
    const อัปเดต = cols.filter((c) => !t.กุญแจ.includes(c)).map((c) => `${c}=excluded.${c}`).join(", ");
    await coreQuery(
      `INSERT INTO ${ชื่อ} (${cols.join(",")}) VALUES ${ก้อน.map(() => ช่อง).join(",")}
       ON CONFLICT(${t.กุญแจ.join(",")}) DO UPDATE SET ${อัปเดต}`,
      ค่า
    );
    ส่งไป += ก้อน.length;
  }
  const [หลัง] = await coreQuery(`SELECT COUNT(*) AS n FROM ${ชื่อ}`);
  /* แถวที่ส่งไปแล้วไม่ได้เพิ่มแถวใหม่ อาจเป็น "ของเดิมที่ทับค่า" (ปกติ) หรือ "กุญแจชนกัน" (ผิด)
     ⇒ แยกสองอย่างนี้ด้วยจำนวนคู่กุญแจที่ไม่ซ้ำในชุดที่ส่งไปรอบนี้ */
  const คู่กุญแจ = new Set(ใช้ได้.map((r) => ค่ากุญแจ(r).map(String).join("|@|")));
  const ยุบ = ใช้ได้.length - คู่กุญแจ.size;
  /* 🔴 **`ยุบ` เห็นได้แค่การซ้ำ "ภายในคำขอเดียว" — มีจุดบอดข้ามคำขอ** (เจอของจริง 19 ก.ย. 2569)
     ยิงซิงก์รอบแรก: TikTok `รับมา 300 · ส่งไป 300 · แถวในฐานหลัง 100` แต่ `ยุบ: 0`
     เพราะ TikTok **เมิน `page`** (เขาใช้ `pageToken`) ⇒ หน้า 1/2/3 คืนแถวชุดเดิมทั้งหมด
     ⇒ แต่ละคำขอไม่มีของซ้ำในตัวเอง ⇒ ตัวนับเงียบ ทั้งที่ของซ้ำกัน 3 เท่า
     🔑 **ข้อจำกัดนี้เคยอยู่แค่ในคำเตือนที่คนต้องอ่าน** — ตัวเลขเป็นคนบอก ไม่ใช่คำเตือน
     ⇒ ส่ง `คู่กุญแจ` ออกไปให้ผู้เรียกรวมข้ามหน้าเอง แล้วตัดสินจากยอดรวมทั้งรอบ
     ⚠️ ห้ามลบช่องนี้ออกเพราะ "ดูไม่จำเป็น" — มันเป็นตัวเดียวที่จับการซ้ำข้ามหน้าได้ */
  return {
    ตาราง: ชื่อ,
    platform: t.platform,
    grain,
    รับมา: (rows || []).length,
    ขาดกุญแจ,
    ส่งไป,
    แถวในฐานก่อน: Number(ก่อน?.n ?? 0),
    แถวในฐานหลัง: Number(หลัง?.n ?? 0),
    ยุบ,
    /* ให้ผู้เรียกรวมข้ามหน้าได้ — **ไม่ใช่ของสำหรับส่งออกทาง HTTP** (อาจยาวหลายร้อยรายการ) */
    คู่กุญแจชุดนี้: คู่กุญแจ,
    ...(ยุบ > 0
      ? {
          "🔴 กุญแจแคบเกิน":
            `ในชุดที่ส่งรอบนี้ มี ${ยุบ} แถวที่คู่กุญแจ (${t.กุญแจ.join(" + ")}) ซ้ำกัน ` +
            "⇒ แถวเหล่านั้น **ทับกันเองในคำสั่งเดียว** ยอดรวมจะต่ำกว่าจริง " +
            "🚫 ห้ามปล่อยผ่าน — ต้องหาช่องเพิ่มเข้ากุญแจ แล้ววัดซ้ำด้วยของจริง",
        }
      : {}),
  };
}

/** จำนวนแถวในกระจกแต่ละตาราง + วันที่ครอบ — ให้จอบอกได้ว่ากระจกครอบถึงไหน
 *  ⚠️ อ่านไม่ได้ ⇒ คืน `readError` ต่อตาราง **ห้ามคืน 0** (0 อ่านได้ว่า "ยังไม่มีข้อมูล" ซึ่งคนละเรื่อง) */
export async function ยอดกระจกการเงิน() {
  if (!coreReady()) return { skip: "ยังต่อฐานคลังเงาไม่ได้" };
  const out = {};
  for (const [ชื่อ, t] of Object.entries(ตาราง)) {
    try {
      const [r] = await coreQuery(
        `SELECT COUNT(*) AS แถว, MIN(day) AS วันแรก, MAX(day) AS วันล่าสุด, MAX(synced_at) AS ซิงก์ล่าสุด FROM ${ชื่อ}`
      );
      out[ชื่อ] = { platform: t.platform, grain: t.grain, กุญแจ: t.กุญแจ, ...r };
    } catch (e) {
      out[ชื่อ] = { platform: t.platform, grain: t.grain, readError: String(e?.message || e).slice(0, 160) };
    }
  }
  return {
    ...out,
    "🚫 ห้ามบวกข้ามตาราง":
      "สามตารางนี้เป็นข้อมูล **คนละระดับ** (wallet-txn · fee-line · statement) " +
      "⇒ ห้ามรวมยอดข้ามตาราง และจอห้ามมีช่อง \"รวมทั้งหมด\" · " +
      "ตัวเลขที่เทียบกันได้คือ **ยอดในตารางเดียวกันช่วงวันเดียวกัน** เท่านั้น",
  };
}
