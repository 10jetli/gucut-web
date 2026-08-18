import type { Metadata } from "next";
import { titleSuffix } from "@/lib/shop";
import SearchClient from "@/components/SearchClient";

export const metadata: Metadata = {
  title: titleSuffix("ค้นหาสินค้า"),
  robots: { index: false },   // หน้าค้นหาไม่ต้องให้ Google เก็บ (มาตรฐานอีคอมเมิร์ซ)
};

export default function SearchPage() {
  return <SearchClient />;
}
