import type { Metadata } from "next";
import AdminChat from "@/components/AdminChat";

export const metadata: Metadata = {
  title: "แชทลูกค้า | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <AdminChat />;
}
