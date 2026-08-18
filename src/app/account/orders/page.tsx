import type { Metadata } from "next";
import { titleSuffix } from "@/lib/shop";
import OrdersView from "@/components/OrdersView";

export const metadata: Metadata = {
  title: titleSuffix("การซื้อของฉัน"),
  robots: { index: false, follow: true },
};

export default function Page() {
  return <OrdersView />;
}
