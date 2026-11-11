import type { Metadata } from "next";
import AdminTikTok from "@/components/AdminTikTok";

export const metadata: Metadata = {
  title: "ท่อคลิป TikTok | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <AdminTikTok />;
}
