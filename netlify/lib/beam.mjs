// รับเงินผ่าน Beam Checkout
//
// ทำไมถึงใช้ Beam แทนการให้ลูกค้าแนบสลิป
//   แบบเดิม: ลูกค้าโอนแล้วถ่ายสลิปแนบมา → ร้านต้องเปิดดูทีละใบว่าจริงไหม ยอดตรงไหม
//            สลิปปลอมทำง่ายมาก และลูกน้องที่กำลังแพ็คของต้องมาคอยตรวจ
//   แบบใหม่: Beam ออก QR ให้ → ลูกค้าจ่าย → ธนาคารยืนยันกับ Beam → Beam บอกเรา
//            ไม่มีสลิปให้ตรวจ ไม่มีทางปลอม และรู้ผลภายในไม่กี่วินาที
//
// สถานะบัญชีร้าน (19 ส.ค. 2569 — Beam แจ้งทางแชท)
//   ผ่านอนุมัติขั้นแรกแล้ว รับเงินได้ทันทีผ่าน "QR พร้อมเพย์ และโมบายแบงก์กิ้ง"
//   บัตรเครดิต/เดบิตออนไลน์ยังรอตรวจเอกสารรอบสอง (เครื่อง Bolt+ ใช้บัตรได้แล้ว)
//
// ⚠️ รหัสอยู่ที่ Environment Variables ของ Netlify เท่านั้น ห้ามเขียนลงโค้ด
//    BEAM_MERCHANT_ID · BEAM_API_KEY · BEAM_ENV (playground = สนามทดลอง ไม่ใช่เงินจริง)

const HOSTS = {
  production: "https://api.beamcheckout.com",
  playground: "https://playground.api.beamcheckout.com",
};

/** ตั้งค่าครบหรือยัง — ยังไม่ครบให้ระบบทำงานต่อได้โดยไม่พัง */
export function beamReady() {
  return !!(process.env.BEAM_MERCHANT_ID && process.env.BEAM_API_KEY);
}

export const beamMode = () => (process.env.BEAM_ENV === "playground" ? "playground" : "production");

function auth() {
  const id = process.env.BEAM_MERCHANT_ID;
  const key = process.env.BEAM_API_KEY;
  if (!id || !key) throw new Error("ยังไม่ได้ใส่รหัส Beam");
  // Beam ใช้ HTTP Basic: base64(merchantId:apiKey)
  return "Basic " + Buffer.from(`${id}:${key}`).toString("base64");
}

async function call(path, init = {}) {
  const r = await fetch(`${HOSTS[beamMode()]}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: auth(),
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* ไม่ใช่ JSON */ }
  if (!r.ok) {
    throw new Error(`Beam ตอบ ${r.status}: ${(body?.message || text || "").slice(0, 200)}`);
  }
  return body;
}

/**
/**
 * ช่องทางที่ Beam รับได้ (OnlinePaymentMethodType)
 *
 * ⚠️ "รับได้" กับ "เปิดใช้กับร้านเรา" เป็นคนละเรื่อง
 *    แต่ละร้านเปิดไม่เท่ากันตามสัญญาที่ทำกับ Beam
 *    ช่องไหนยังไม่เปิด Beam จะตีกลับตอนสร้างรายการ — หน้าเว็บต้องบอกลูกค้าให้เลือกทางอื่น
 *
 * ⚠️ ไม่ใส่ CARD / CARD_INSTALLMENTS / CARD_TOKEN โดยตั้งใจ
 *    Beam รับบัตรผ่าน API ด้วยการส่ง "เลขบัตรเต็ม" มาที่เซิร์ฟเวอร์เรา
 *    ทำแบบนั้น = ร้านเข้าข่ายต้องทำตามมาตรฐาน PCI DSS ซึ่งเป็นภาระคนละระดับ
 *    และเลขบัตรลูกค้าจะวิ่งผ่านเครื่องเรา ซึ่งไม่ควรแตะตั้งแต่แรก
 *    อยากรับบัตรต้องใช้หน้าจ่ายเงินที่ Beam โฮสต์เอง (Payment Link) — คนละงานกัน
 */
/**
 * ⚠️ mark/color มีไว้วาด "ตราสัญลักษณ์แทนโลโก้" บนหน้าจ่ายเงิน
 *    ใช้อักษรย่อบนพื้นสีประจำแบรนด์ ไม่ใช่ไฟล์โลโก้จริง — ตั้งใจ
 *    เอาโลโก้ของคนอื่นมาแปะเองมีเรื่องเครื่องหมายการค้า และร้านไม่มีสิทธิ์ในไฟล์นั้น
 *    (ร้านนี้ระวังเรื่องเครื่องหมายการค้าเป็นพิเศษอยู่แล้ว ดู licenses.ts)
 *
 * ⚠️ group ใช้จัดกลุ่มแอปธนาคาร ๕ ตัวให้อยู่ใต้หัวข้อเดียว
 *    เรียงเรียบ ๑๒ แถวรวดคือกำแพงตัวเลือกที่ลูกค้าเลื่อนผ่าน
 *    จัดกลุ่มแล้วเหลือ ๘ แถว เท่ากับที่ Shopee/Lazada/TikTok ทำ
 */
export const PAY_METHODS = [
  { id: "QR_PROMPT_PAY",    label: "QR พร้อมเพย์",    note: "สแกนด้วยแอปธนาคารใดก็ได้ · ไม่ต้องแนบสลิป", mark: "QR",  color: "#1a3a8f" },
  { id: "TRUE_MONEY",       label: "TrueMoney Wallet", note: "จ่ายจากวอลเล็ตทรูมันนี่",                  mark: "TM",  color: "#f5820b" },
  { id: "SHOPEE_PAY",       label: "ShopeePay",        note: "จ่ายจากวอลเล็ตช้อปปี้",                    mark: "S",   color: "#ee4d2d" },
  { id: "LINE_PAY",         label: "Rabbit LINE Pay",  note: "จ่ายผ่านแอปไลน์",                          mark: "LP",  color: "#06c755" },
  { id: "SPAY_LATER",       label: "SPayLater",        note: "ผ่อนจ่ายกับช้อปปี้",                        mark: "SPL", color: "#ee4d2d" },
  { id: "KPLUS",            label: "K PLUS",           note: "กสิกรไทย",     mark: "K",   color: "#138f2d", group: "bank" },
  { id: "SCB_EASY",         label: "SCB EASY",         note: "ไทยพาณิชย์",   mark: "SCB", color: "#4e2e7f", group: "bank" },
  { id: "KRUNGSRI_APP",     label: "Krungsri",         note: "กรุงศรีอยุธยา", mark: "KS",  color: "#8b6f2e", group: "bank" },
  { id: "BANGKOK_BANK_APP", label: "Bangkok Bank",     note: "กรุงเทพ",      mark: "BBL", color: "#1e4b9c", group: "bank" },
  { id: "MAKE",             label: "MAKE by KBank",    note: "กสิกรไทย",     mark: "M",   color: "#138f2d", group: "bank" },
  { id: "ALIPAY",           label: "Alipay",           note: "สำหรับลูกค้าต่างชาติ", mark: "A",  color: "#1677ff", group: "intl" },
  { id: "WECHAT_PAY",       label: "WeChat Pay",       note: "สำหรับลูกค้าต่างชาติ", mark: "WC", color: "#07c160", group: "intl" },
];

const METHOD_IDS = new Set(PAY_METHODS.map((m) => m.id));

/**
 * แปลงชื่อชนิดเป็นชื่อ object ย่อยที่ Beam ต้องการ
 * QR_PROMPT_PAY → qrPromptPay · TRUE_MONEY → trueMoney
 */
const subKey = (type) =>
  type.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/**
 * ดึงชื่อ field ที่ Beam บอกว่าขาดออกมาจากข้อความ error
 * เช่น "inputs are failing validation: qrPromptPay is a required field"
 */
const missingField = (msg) =>
  /([A-Za-z][A-Za-z0-9]*) is a required field/.exec(String(msg || ""))?.[1] || "";

/**
 * สร้างรายการรับเงิน
 *
 * ⚠️ Beam คิดยอดเป็น "สตางค์" ไม่ใช่บาท — ส่ง 100 บาทต้องส่ง 10000
 *    ส่งเป็นบาทตรง ๆ = เก็บเงินลูกค้าน้อยกว่าจริงร้อยเท่า
 * ⚠️ referenceId ต้องเป็นเลขออเดอร์ของเรา จะได้จับคู่กลับได้ตอน Beam แจ้งผล
 *
 * ⚠️ Beam ต้องการ object ย่อย "ชื่อเดียวกับชนิดการจ่าย" ด้วย ไม่ใช่แค่ paymentMethodType
 *    ใส่แค่ paymentMethodType จะโดนตีกลับว่า "qrPromptPay is a required field"
 *    เราเดาชื่อจากชนิด (QR_PROMPT_PAY → qrPromptPay) ซึ่งตรงกับทุกตัวที่รู้
 *    แต่ถ้าเดาผิด จะอ่านชื่อจริงจากข้อความ error แล้วยิงใหม่อีกครั้งเดียว
 *    ⇒ เพิ่มช่องทางใหม่ได้โดยไม่ต้องรู้ชื่อ field ล่วงหน้า และไม่พังถ้า Beam ตั้งชื่อไม่ตามแบบ
 */
export async function createQrCharge({ orderId, baht, returnUrl, method, paymentMethod }) {
  const satang = Math.round(Number(baht) * 100);
  if (!(satang > 0)) throw new Error("ยอดเงินไม่ถูกต้อง");

  const type = METHOD_IDS.has(method) ? method : "QR_PROMPT_PAY";

  const send = (pm) =>
    call("/api/v1/charges", {
      method: "POST",
      body: JSON.stringify({
        amount: satang,
        currency: "THB",
        referenceId: String(orderId),
        returnUrl,
        paymentMethod: pm,
        deviceType: "WEB",
      }),
    });

  let res;
  if (paymentMethod) {
    res = await send(paymentMethod);
  } else {
    try {
      res = await send({ paymentMethodType: type, [subKey(type)]: {} });
    } catch (e) {
      const need = missingField(e?.message);
      // ยิงใหม่ครั้งเดียวด้วยชื่อที่ Beam บอกมาเอง — ถ้ายังไม่ได้ก็ปล่อยให้ error ขึ้นไป
      if (!need || need === subKey(type)) throw e;
      res = await send({ paymentMethodType: type, [need]: {} });
    }
  }

  const img = res?.encodedImage?.imageBase64Encoded;
  return {
    chargeId: res?.chargeId || "",
    qrBase64: img ? (img.startsWith("data:") ? img : `data:image/png;base64,${img}`) : "",
    expiry: res?.encodedImage?.expiry || null,
    redirectUrl: res?.redirect?.redirectUrl || "",
    actionRequired: res?.actionRequired || "",
  };
}

/**
 * ถามสถานะรายการรับเงิน
 *
 * ⚠️ ตอน Beam ยิง webhook มาบอกว่าจ่ายแล้ว "ห้ามเชื่อเนื้อความที่ส่งมาเลย"
 *    ใครก็ยิงเข้ามาบอกว่าจ่ายแล้วได้ ต้องถามกลับไปที่ Beam เองทุกครั้งว่าจริงไหม
 *    ปลอดภัยกว่าการตรวจลายเซ็น และไม่ต้องพึ่งความลับเพิ่มอีกตัว
 */
export async function getCharge(chargeId) {
  const id = String(chargeId || "").trim();
  if (!id) throw new Error("ไม่มีเลขรายการ");
  return call(`/api/v1/charges/${encodeURIComponent(id)}`, { method: "GET" });
}

/** รายการนี้จ่ายเงินสำเร็จแล้วจริงไหม */
export const chargePaid = (c) =>
  ["SUCCEEDED", "SUCCESS", "PAID", "COMPLETED"].includes(
    String(c?.status || c?.chargeStatus || "").toUpperCase(),
  );
