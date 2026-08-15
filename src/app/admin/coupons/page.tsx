import type { Metadata } from "next";
import AdminCoupons from "@/components/AdminCoupons";

export const metadata: Metadata = {
  title: "โค้ดส่วนลด | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <AdminCoupons />;
}
