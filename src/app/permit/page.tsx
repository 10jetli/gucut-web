import type { Metadata } from "next";
import PermitView from "@/components/PermitView";
import { BRAND, titleSuffix } from "@/lib/shop";
import { SITE_URL } from "@/lib/site";

// ⚠️ หน้านี้ไม่ได้ทำไว้แค่บริการลูกค้าเก่า — คนที่ค้นกูเกิลว่า
//    "ขอทะเบียนเลื่อยยนต์ยังไง" คือคนที่มีเลื่อยอยู่แล้วหรือกำลังจะซื้อ ตรงกลุ่มพอดี
//    ตอนนี้ยังไม่มีเว็บไหนทำเรื่องนี้ให้ง่าย จึงเป็นช่องที่ขึ้นอันดับได้ไม่ยาก
export const metadata: Metadata = {
  title: titleSuffix("ขอทะเบียนเลื่อยยนต์ — กรอกแบบ ลซ.1 ออนไลน์ ฟรี"),
  description:
    "กรอกแบบ ลซ.1 คำขอรับใบอนุญาตให้มีเลื่อยโซ่ยนต์ ให้เสร็จในหน้าเดียว " +
    "ถ่ายบัตรประชาชนแล้วระบบกรอกให้ พิมพ์ไปยื่นที่สำนักงานทรัพยากรธรรมชาติและสิ่งแวดล้อมจังหวัดได้เลย " +
    "ใช้ฟรี ไม่ต้องซื้อของก่อน — ข้อมูลอยู่ในเครื่องคุณเท่านั้น",
  alternates: { canonical: `${SITE_URL}/permit/` },
};

export default function Page() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "ขอใบอนุญาตให้มีเลื่อยโซ่ยนต์ (แบบ ลซ.1)",
    description:
      "ขั้นตอนขอใบอนุญาตให้มีเลื่อยโซ่ยนต์ไว้ในครอบครอง ตามพระราชบัญญัติเลื่อยโซ่ยนต์ พ.ศ. 2545",
    totalTime: "PT30M",
    supply: [
      { "@type": "HowToSupply", name: "สำเนาบัตรประจำตัวประชาชน" },
      { "@type": "HowToSupply", name: "สำเนาทะเบียนบ้าน" },
      { "@type": "HowToSupply", name: "แบบ ลซ.1 ที่กรอกและลงชื่อแล้ว" },
    ],
    step: [
      { "@type": "HowToStep", name: "เลือกรุ่นเลื่อย", text: "ตรวจว่ารุ่นที่มีต้องขอใบอนุญาตหรือไม่" },
      { "@type": "HowToStep", name: "กรอกแบบ ลซ.1", text: `กรอกที่ ${BRAND.name} หรือเขียนด้วยมือ` },
      { "@type": "HowToStep", name: "เตรียมเอกสารแนบ", text: "สำเนาบัตรประชาชนและสำเนาทะเบียนบ้าน" },
      {
        "@type": "HowToStep",
        name: "ยื่นคำขอ",
        text: "นำไปยื่นต่อนายทะเบียนเลื่อยโซ่ยนต์ที่สำนักงานทรัพยากรธรรมชาติและสิ่งแวดล้อมจังหวัด",
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PermitView />
    </>
  );
}
