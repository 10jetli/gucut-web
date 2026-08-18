import type { Metadata } from "next";
import { titleSuffix } from "@/lib/shop";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = {
  title: titleSuffix("เข้าสู่ระบบ"),
  robots: { index: false, follow: true },
};

export default function Page() {
  return <AuthForm mode="login" />;
}
