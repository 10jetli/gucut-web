import type { Metadata } from "next";
import { titleSuffix } from "@/lib/shop";
import SocialLink from "@/components/SocialLink";

export const metadata: Metadata = {
  title: titleSuffix("ผูกบัญชี"),
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SocialLink />;
}
