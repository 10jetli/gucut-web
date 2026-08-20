import type { Metadata } from "next";
import TimeClock from "@/components/TimeClock";

export const metadata: Metadata = {
  title: "ลงเวลาเข้างาน | GUCUT",
  robots: { index: false, follow: false },   // หน้าพนักงาน ห้าม Google เก็บ
};

export default function Page() {
  return <TimeClock />;
}
