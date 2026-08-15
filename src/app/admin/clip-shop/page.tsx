import type { Metadata } from "next";
import AdminClipShop from "@/components/AdminClipShop";

export const metadata: Metadata = {
  title: "ผูกสินค้ากับคลิป | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <AdminClipShop />;
}
