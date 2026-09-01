import { useEffect, useState } from "react";
import { api } from "../lib/api";

export type GameAdCfg = {
  ad_type: "interstitial" | "rewarded";
  chances_per_ad: number;
  every_n: number;
};

// Spec defaults — mirror backend AppMetaSettings.game_ad_config so behaviour is
// correct even before the network config resolves.
const DEFAULTS: Record<string, GameAdCfg> = {
  checkin:         { ad_type: "interstitial", chances_per_ad: 0,  every_n: 1 },
  higher_lower:    { ad_type: "interstitial", chances_per_ad: 10, every_n: 2 },
  memory:          { ad_type: "rewarded",     chances_per_ad: 1,  every_n: 0 },
  tictactoe:       { ad_type: "interstitial", chances_per_ad: 10, every_n: 2 },
  math:            { ad_type: "interstitial", chances_per_ad: 10, every_n: 2 },
  daily_challenge: { ad_type: "rewarded",     chances_per_ad: 0,  every_n: 1 },
  tap:             { ad_type: "interstitial", chances_per_ad: 5,  every_n: 1 },
  trivia:          { ad_type: "interstitial", chances_per_ad: 5,  every_n: 1 },
  survey:          { ad_type: "interstitial", chances_per_ad: 0,  every_n: 1 },
};

/**
 * Returns the admin-configured ad settings for a game key, falling back to the
 * spec defaults. Fetches /api/app-config once on mount.
 */
export function useGameAdConfig(key: string): GameAdCfg {
  const [cfg, setCfg] = useState<GameAdCfg>(DEFAULTS[key] || { ad_type: "interstitial", chances_per_ad: 5, every_n: 1 });

  useEffect(() => {
    let alive = true;
    api<{ game_ad_config?: Record<string, Partial<GameAdCfg>> }>("/app-config", { auth: false })
      .then((c) => {
        if (!alive) return;
        const remote = c?.game_ad_config?.[key];
        if (remote) {
          setCfg({ ...(DEFAULTS[key] || {} as any), ...remote } as GameAdCfg);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [key]);

  return cfg;
}
