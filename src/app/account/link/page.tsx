import type { Metadata } from "next";
import SocialLink from "@/components/SocialLink";

export const metadata: Metadata = {
  title: "ผูกบัญชี | GUCUT",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SocialLink />;
}
