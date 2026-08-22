import type { Metadata } from "next";
import AdminLegacy from "@/components/AdminLegacy";

export const metadata: Metadata = {
  title: "ประวัติลูกค้าเก่า | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <AdminLegacy />;
}
