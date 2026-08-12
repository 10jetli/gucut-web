import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "สมัครสมาชิก | GUCUT",
  robots: { index: false, follow: true },
};

export default function Page() {
  return <AuthForm mode="register" />;
}
