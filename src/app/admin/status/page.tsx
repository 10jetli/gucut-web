import type { Metadata } from "next";
import AdminStatus from "@/components/AdminStatus";

export const metadata: Metadata = {
  title: "สถานะระบบ | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <AdminStatus />;
}
