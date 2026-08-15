import type { Metadata } from "next";
import PointsView from "@/components/PointsView";

export const metadata: Metadata = {
  title: "แต้มสะสม | GUCUT",
  robots: { index: false, follow: true },
};

export default function Page() {
  return <PointsView />;
}
