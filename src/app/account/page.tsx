import type { Metadata } from "next";
import { titleSuffix } from "@/lib/shop";
import AccountHome from "@/components/AccountHome";

export const metadata: Metadata = { title: titleSuffix("บัญชีของฉัน") };

export default function AccountPage() {
  return <AccountHome />;
}
