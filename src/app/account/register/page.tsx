import type { Metadata } from "next";
import { titleSuffix } from "@/lib/shop";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = {
  title: titleSuffix("สมัครสมาชิก"),
  robots: { index: false, follow: true },
};

export default function Page() {
  return <AuthForm mode="register" />;
}
