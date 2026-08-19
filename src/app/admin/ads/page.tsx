import type { Metadata } from "next";
import AdminAds from "@/components/AdminAds";

export const metadata: Metadata = {
  title: "ค่าโฆษณา vs ยอดขาย | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <AdminAds />;
}
