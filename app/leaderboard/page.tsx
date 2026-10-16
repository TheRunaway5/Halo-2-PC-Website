import type { Metadata } from "next";
import { LeaderboardView } from "@/components/leaderboard";
export const metadata: Metadata = {
  title: "Community leaderboard",
  description: "Explore all-time Halo 2 Forever community match statistics.",
};
export default function Page() {
  return <LeaderboardView />;
}
