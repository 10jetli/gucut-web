import type { Metadata } from "next";
import OrdersView from "@/components/OrdersView";

export const metadata: Metadata = {
  title: "การซื้อของฉัน | GUCUT",
  robots: { index: false, follow: true },
};

export default function Page() {
  return <OrdersView />;
}
