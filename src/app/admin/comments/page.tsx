import type { Metadata } from "next";
import AdminComments from "@/components/AdminComments";

export const metadata: Metadata = {
  title: "คอมเมนต์ใต้คลิป | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <AdminComments />;
}
