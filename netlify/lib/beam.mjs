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
 * สร้างรายการรับเงินด้วย QR พร้อมเพย์
 *
 * ⚠️ Beam คิดยอดเป็น "สตางค์" ไม่ใช่บาท — ส่ง 100 บาทต้องส่ง 10000
 *    ส่งเป็นบาทตรง ๆ = เก็บเงินลูกค้าน้อยกว่าจริงร้อยเท่า
 * ⚠️ referenceId ต้องเป็นเลขออเดอร์ของเรา จะได้จับคู่กลับได้ตอน Beam แจ้งผล
 */
export async function createQrCharge({ orderId, baht, returnUrl }) {
  const satang = Math.round(Number(baht) * 100);
  if (!(satang > 0)) throw new Error("ยอดเงินไม่ถูกต้อง");

  const res = await call("/api/v1/charges", {
    method: "POST",
    body: JSON.stringify({
      amount: satang,
      currency: "THB",
      referenceId: String(orderId),
      returnUrl,
      paymentMethod: { paymentMethodType: "QR_PROMPT_PAY" },
      deviceType: "WEB",
    }),
  });

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
