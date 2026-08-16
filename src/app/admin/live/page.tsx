import type { Metadata } from "next";
import AdminLive from "@/components/AdminLive";

export const metadata: Metadata = {
  title: "คนเข้าเว็บ | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <AdminLive />;
}
