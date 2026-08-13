import type { Metadata } from "next";
import VideoPicker from "@/components/VideoPicker";

export const metadata: Metadata = {
  title: "เลือกคลิป | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <VideoPicker />;
}
