import type { Metadata } from "next";
import AdminAttendance from "@/components/AdminAttendance";

export const metadata: Metadata = {
  title: "ลงเวลาพนักงาน | GUCUT",
  robots: { index: false, follow: false },   // ห้าม Google เก็บหน้านี้เด็ดขาด
};

export default function Page() {
  return <AdminAttendance />;
}
