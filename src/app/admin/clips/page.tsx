import type { Metadata } from "next";
import AdminClipStats from "@/components/AdminClipStats";

export const metadata: Metadata = {
  title: "สถิติคลิป | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <AdminClipStats />;
}
