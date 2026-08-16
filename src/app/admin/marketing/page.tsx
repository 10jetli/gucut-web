import type { Metadata } from "next";
import AdminMarketing from "@/components/AdminMarketing";

export const metadata: Metadata = {
  title: "พิกเซลการตลาด | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <AdminMarketing />;
}
