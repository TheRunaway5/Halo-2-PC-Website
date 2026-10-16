import { Suspense } from "react";
import type { Metadata } from "next";
import { PlayerSearch } from "@/components/player-search";
import { Loading } from "@/components/ui";
export const metadata: Metadata = { title: "Player search & service records" };
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <PlayerSearch />
    </Suspense>
  );
}
