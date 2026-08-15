import type { Metadata } from "next";
import AdminPoints from "@/components/AdminPoints";

export const metadata: Metadata = {
  title: "แต้มสะสม | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <AdminPoints />;
}
