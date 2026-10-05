import { IconName } from "@/src/components/ui/Icon";

export type GameDef = {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  reward: number; // points per win
};

export const GAMES: GameDef[] = [
  { id: "higher-lower", title: "Higher Lower", subtitle: "Guess the number", icon: "trophy", reward: 100 },
  { id: "memory-match", title: "Memory Match", subtitle: "Match the pairs", icon: "grid", reward: 200 },
  { id: "tic-tac-toe", title: "Tic-Tac-Toe", subtitle: "Beat the bot", icon: "hand", reward: 150 },
  { id: "tap-coins", title: "Catch Rewards", subtitle: "Grab gifts, dodge bombs", icon: "gift", reward: 120 },
  { id: "solve-earn", title: "Solve & Earn", subtitle: "Quick maths", icon: "brain", reward: 100 },
];

export const CHANCES_PER_AD = 5;
export const INTERSTITIAL_EVERY = 2; // show rewarded interstitial every 2 reward claims
