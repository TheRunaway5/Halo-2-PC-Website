import { Suspense } from "react";
import type { Metadata } from "next";
import { CarnageReport } from "@/components/carnage-report";
import { Loading } from "@/components/ui";
export const metadata: Metadata = {
  title: "Postgame carnage report",
  robots: { index: false, follow: true },
};
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <CarnageReport />
    </Suspense>
  );
}
