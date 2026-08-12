import type { Metadata } from "next";
import LineLink from "@/components/LineLink";

export const metadata: Metadata = {
  title: "ผูกบัญชี LINE | GUCUT",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <LineLink />;
}
