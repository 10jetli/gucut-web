import type { Metadata } from "next";
import AdminPermits from "@/components/AdminPermits";

export const metadata: Metadata = {
  title: "ใบ ลซ.๒ ที่ลูกค้าส่งมา | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <AdminPermits />;
}
