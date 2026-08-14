import type { Metadata } from "next";
import AdminOrders from "@/components/AdminOrders";

export const metadata: Metadata = {
  title: "ออเดอร์ | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <AdminOrders />;
}
