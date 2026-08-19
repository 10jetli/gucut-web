// ช่องทางชำระเงินที่เปิดใช้จริง — /api/pay-options  (หน้าเช็คเอาต์เรียก)
//
// ⚠️ มีไว้เพื่อไม่ให้หน้าเว็บ "เดา" ว่าจ่ายทางไหนได้
//    เคยเขียนตายตัวว่าจ่ายปลายทางได้ทั้งที่ปิดอยู่ แล้วลูกค้ามาเจอว่าสั่งไม่ได้ตอนกดยืนยัน
//    ถามเซิร์ฟเวอร์ทีเดียวจบ และตรงกับที่ /api/orders ยอมรับจริงเสมอ
import { beamReady } from "../lib/beam.mjs";

export default async function handler() {
  return new Response(
    JSON.stringify({
      beam: beamReady(),                                  // QR พร้อมเพย์ ตรวจอัตโนมัติ
      cod: process.env.NEXT_PUBLIC_COD === "1",           // เก็บเงินปลายทาง
      promptpaySlip: !!process.env.NEXT_PUBLIC_PROMPTPAY_ID, // QR แบบให้ลูกค้าแนบสลิปเอง
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        // เปลี่ยนไม่บ่อย แต่ต้องไม่ค้างนาน ถ้าร้านเปิด/ปิดช่องทาง
        "Cache-Control": "public, max-age=30",
        "Netlify-CDN-Cache-Control": "public, s-maxage=120",
      },
    },
  );
}

export const config = { path: "/api/pay-options" };
