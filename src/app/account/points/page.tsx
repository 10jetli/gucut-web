import type { Metadata } from "next";
import { titleSuffix } from "@/lib/shop";
import PointsView from "@/components/PointsView";

export const metadata: Metadata = {
  title: titleSuffix("แต้มสะสม"),
  robots: { index: false, follow: true },
};

export default function Page() {
  return <PointsView />;
}
