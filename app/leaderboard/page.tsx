import type { Metadata } from "next";
import { LeaderboardView } from "@/components/leaderboard";
export const metadata: Metadata = {
  title: "Community leaderboard",
  description: "Explore the top 25 Halo 2 Forever players in each playlist.",
};
export default function Page() {
  return <LeaderboardView />;
}
