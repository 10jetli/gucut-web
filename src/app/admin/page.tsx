import type { Metadata } from "next";
import AdminHome from "@/components/AdminHome";

export const metadata: Metadata = {
  title: "ระบบหลังร้าน | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <AdminHome />;
}
