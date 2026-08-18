import type { Metadata } from "next";
import { audit } from "@/lib/audit";
import AdminSeo from "@/components/AdminSeo";

// ตรวจสุขภาพ SEO GEO AEO — /admin/seo/
//
// รวมงานของแอปที่เคยจ่ายรายเดือนบน Shopify สองตัวไว้ที่เดียว
//   SearchPie SEO & Speed → ตรวจ meta · ลิงก์เสีย · เนื้อหาซ้ำ · น้ำหนักไฟล์รูป
//   Vizby AI              → ความพร้อมให้ AI หยิบไปตอบ · agents.md · บอต AI ที่มาเก็บข้อมูลจริง
//
// รายการงานคิดตอน build จากข้อมูลจริงในโปรเจกต์ (จึงไม่มีปุ่ม "สแกนใหม่" — อัปเดตตอน deploy)
// ส่วนแผงบอต AI เป็นข้อมูลสด กดโหลดเองในหน้า
export const metadata: Metadata = {
  title: "ตรวจสุขภาพ SEO GEO AEO | GUCUT",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminSeo data={audit()} />;
}
