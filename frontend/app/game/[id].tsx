import React from "react";
import { useLocalSearchParams, Redirect } from "expo-router";

import { GameShell } from "@/src/components/games/GameShell";
import {
  HigherLower,
  MemoryMatch,
  TicTacToe,
  CatchRewards,
  SolveEarn,
} from "@/src/components/games/games";
import { GAMES } from "@/src/constants/games";

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const game = GAMES.find((g) => g.id === id);

  if (!game) return <Redirect href="/(tabs)" />;

  return (
    <GameShell gameId={game.id} title={game.title}>
      {(api) => {
        switch (game.id) {
          case "higher-lower":
            return <HigherLower api={api} reward={game.reward} />;
          case "memory-match":
            return <MemoryMatch api={api} reward={game.reward} />;
          case "tic-tac-toe":
            return <TicTacToe api={api} reward={game.reward} />;
          case "tap-coins":
            return <CatchRewards api={api} reward={game.reward} />;
          case "solve-earn":
            return <SolveEarn api={api} reward={game.reward} />;
          default:
            return null;
        }
      }}
    </GameShell>
  );
}
