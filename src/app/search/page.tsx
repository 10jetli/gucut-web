import type { Metadata } from "next";
import SearchClient from "@/components/SearchClient";

export const metadata: Metadata = {
  title: "ค้นหาสินค้า | GUCUT",
  robots: { index: false },   // หน้าค้นหาไม่ต้องให้ Google เก็บ (มาตรฐานอีคอมเมิร์ซ)
};

export default function SearchPage() {
  return <SearchClient />;
}
