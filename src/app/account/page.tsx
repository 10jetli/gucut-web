import type { Metadata } from "next";
import AccountHome from "@/components/AccountHome";

export const metadata: Metadata = { title: "บัญชีของฉัน | GUCUT" };

export default function AccountPage() {
  return <AccountHome />;
}
