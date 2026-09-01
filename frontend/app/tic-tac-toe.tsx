import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, X, Circle, Trophy, Coins } from "lucide-react-native";
import { theme } from "../src/lib/theme";
import { api } from "../src/lib/api";
import { useAuth } from "../src/context/AuthContext";
import NativeAd from "../src/components/NativeAd";
import RewardedAdModal from "../src/components/RewardedAdModal";
import InterstitialAdModal from "../src/components/InterstitialAdModal";
import { useGameSession } from "../src/hooks/useGameSession";
import { useGameAdConfig } from "../src/hooks/useGameAdConfig";
import MaintenanceCard from "../src/components/MaintenanceCard";
import { useMaintenance } from "../src/hooks/useMaintenance";

type Cell = "X" | "O" | null;
type Difficulty = "easy" | "medium" | "hard";

const WIN_LINES: number[][] = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

function checkWinner(b: Cell[]): { winner: Cell; line: number[] | null } {
  for (const line of WIN_LINES) {
    const [a, c, d] = line;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { winner: b[a], line };
  }
  return { winner: null, line: null };
}

function emptyCells(b: Cell[]): number[] {
  return b.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
}

function minimax(b: Cell[], me: Cell, current: Cell): { score: number; move: number } {
  const w = checkWinner(b).winner;
  if (w === me) return { score: 10, move: -1 };
  if (w && w !== me) return { score: -10, move: -1 };
  const empties = emptyCells(b);
  if (empties.length === 0) return { score: 0, move: -1 };
  let best = current === me ? { score: -Infinity, move: -1 } : { score: Infinity, move: -1 };
  for (const idx of empties) {
    const nb = [...b]; nb[idx] = current;
    const next = minimax(nb, me, current === "X" ? "O" : "X");
    if (current === me ? next.score > best.score : next.score < best.score) {
      best = { score: next.score, move: idx };
    }
  }
  return best;
}

function aiMove(b: Cell[], difficulty: Difficulty, ai: Cell): number {
  const empties = emptyCells(b);
  if (empties.length === 0) return -1;
  if (difficulty === "easy") return empties[Math.floor(Math.random() * empties.length)];
  if (difficulty === "medium") {
    if (Math.random() < 0.5) return empties[Math.floor(Math.random() * empties.length)];
  }
  return minimax(b, ai, ai).move;
}

export default function TicTacToe() {
  const maint = useMaintenance("/tic-tac-toe");
  const router = useRouter();
  const { refreshUser } = useAuth();
  const adCfg = useGameAdConfig("tictactoe");
  const session = useGameSession(adCfg.chances_per_ad, adCfg.every_n, "tm:game:ttt");
  const [showRewardedAd, setShowRewardedAd] = useState(false);
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<Cell>("X");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [over, setOver] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState<{ winner: Cell; line: number[] | null }>({ winner: null, line: null });
  const [winPopup, setWinPopup] = useState<{ visible: boolean; points: number; title: string } | null>(null);

  const [tttWin, setTttWin] = useState<number>(100);
  useEffect(() => {
    api<{ ttt_win?: number }>("/app-config", { auth: false })
      .then((c) => setTttWin(Number(c?.ttt_win ?? 100) || 100))
      .catch(() => {});
  }, []);

  // Show interstitial when triggered.
  useEffect(() => {
    if (!session.shouldShowInterstitial) return;
    // InterstitialAdModal handles the show itself; just trigger it.
  }, [session.shouldShowInterstitial]);

  const reset = () => {
    setBoard(Array(9).fill(null));
    setTurn("X");
    setOver(false);
    setWinnerInfo({ winner: null, line: null });
  };

  const submit = useCallback(async (result: "win" | "draw" | "loss") => {
    try {
      const r = await api<{ reward: number }>(
        "/games/tictactoe/play",
        { method: "POST", body: { result, difficulty } },
      );
      session.consume();
      await refreshUser();
      const title = result === "win" ? "You won! 🎉" : result === "draw" ? "Draw 🤝" : "AI won 🤖";
      setWinPopup({ visible: true, points: r.reward, title });
    } catch {
      setWinPopup({ visible: true, points: 0, title: "Round complete" });
    }
  }, [difficulty, refreshUser, session]);

  const onCellPress = (i: number) => {
    if (over || board[i] !== null || turn !== "X") return;
    if (!session.hasUnlocked || session.chancesLeft <= 0) {
      setShowRewardedAd(true);
      return;
    }
    const nb = [...board]; nb[i] = "X";
    setBoard(nb);
    const w = checkWinner(nb);
    if (w.winner) { setWinnerInfo(w); setOver(true); submit("win"); return; }
    if (emptyCells(nb).length === 0) { setOver(true); submit("draw"); return; }
    setTurn("O");
    setTimeout(() => {
      const move = aiMove(nb, difficulty, "O");
      if (move < 0) return;
      const ab = [...nb]; ab[move] = "O";
      setBoard(ab);
      const w2 = checkWinner(ab);
      if (w2.winner) { setWinnerInfo(w2); setOver(true); submit("loss"); return; }
      if (emptyCells(ab).length === 0) { setOver(true); submit("draw"); return; }
      setTurn("X");
    }, 350);
  };

  const newGame = () => {
    if (!session.hasUnlocked || session.chancesLeft <= 0) {
      setShowRewardedAd(true);
      return;
    }
    reset();
  };

  if (maint.enabled) return <MaintenanceCard title="Tic-Tac-Toe" note={maint.note} />;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="back-btn">
          <ChevronLeft size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Tic-Tac-Toe vs AI</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.diffRow}>
        {(["easy","medium","hard"] as Difficulty[]).map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.diffBtn, difficulty === d && styles.diffBtnActive]}
            onPress={() => { setDifficulty(d); reset(); }}
            testID={`ttt-diff-${d}`}
          >
            <Text style={[styles.diffTxt, difficulty === d && { color: "#fff" }]}>{d.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.chancesRow}>
        <Coins size={14} color={theme.colors.primary} />
        <Text style={styles.chancesText} testID="ttt-chances">
          Chances left: {session.chancesLeft} / 10
        </Text>
      </View>
      <Text style={styles.subtle}>Reward: easy {Math.round(tttWin * 0.3)} • medium {Math.round(tttWin * 0.6)} • hard {tttWin} (per win)</Text>

      <View style={styles.board}>
        {board.map((c, i) => {
          const inWin = winnerInfo.line?.includes(i);
          return (
            <TouchableOpacity
              key={i}
              style={[styles.cell, inWin && styles.cellWin]}
              onPress={() => onCellPress(i)}
              activeOpacity={0.7}
              testID={`ttt-cell-${i}`}
            >
              {c === "X" ? <X size={56} color={inWin ? "#fff" : "#6366F1"} strokeWidth={4} />
                : c === "O" ? <Circle size={48} color={inWin ? "#fff" : "#EF4444"} strokeWidth={4} />
                : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {over && (
        <Text style={styles.result}>
          {winnerInfo.winner === "X" ? "You won! 🎉" : winnerInfo.winner === "O" ? "AI won. 🤖" : "Draw 🤝"}
        </Text>
      )}

      <TouchableOpacity style={styles.newBtn} onPress={newGame} testID="ttt-new">
        <Text style={styles.newBtnTxt}>
          {(!session.hasUnlocked || session.chancesLeft <= 0)
            ? "Watch Ad to Get Chances"
            : (over ? "Play Again" : "Restart")}
        </Text>
      </TouchableOpacity>

      <RewardedAdModal
        visible={showRewardedAd}
        duration={3}
        onReward={() => {
          setShowRewardedAd(false);
          session.grantChances();
          reset();
        }}
        onClose={() => {
          setShowRewardedAd(false);
          // user skipped; gate stays — they can tap restart to retry.
        }}
      />

      <InterstitialAdModal
        visible={session.shouldShowInterstitial}
        duration={3}
        onDone={session.acknowledgeInterstitial}
      />

      <Modal visible={!!winPopup?.visible} transparent animationType="fade">
        <View style={styles.popupOverlay}>
          <View style={styles.popupCard}>
            <View style={styles.popupIcon}>
              <Trophy size={42} color={theme.colors.success} />
            </View>
            <Text style={styles.popupTitle}>{winPopup?.title}</Text>
            <Text style={styles.popupPoints} testID="ttt-win-points">
              {winPopup && winPopup.points > 0 ? `+${winPopup.points} pts` : "No points this round"}
            </Text>
            <TouchableOpacity
              style={styles.popupBtn}
              onPress={() => { setWinPopup(null); reset(); }}
              testID="ttt-popup-close"
            >
              <Text style={styles.popupBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <View style={styles.adWrap}>
        <NativeAd testID="ttt-native-ad" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: theme.spacing.md },
  title: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  adWrap: { paddingHorizontal: theme.spacing.lg },
  diffRow: { flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 8 },
  diffBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  diffBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  diffTxt: { fontSize: 12, fontWeight: "800", color: theme.colors.text },
  chancesRow: {
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6,
    marginTop: 10,
  },
  chancesText: { color: theme.colors.primary, fontWeight: "800", fontSize: 13 },
  subtle: { textAlign: "center", color: theme.colors.muted, fontSize: 12, marginTop: 6 },
  board: { flexDirection: "row", flexWrap: "wrap", alignSelf: "center", marginTop: 14, width: 300 },
  cell: {
    width: 96, height: 96, margin: 2,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    alignItems: "center", justifyContent: "center", borderRadius: 12,
  },
  cellWin: { backgroundColor: "#10B981", borderColor: "#10B981" },
  result: { textAlign: "center", fontSize: 22, fontWeight: "800", marginTop: 12, color: theme.colors.text },
  newBtn: {
    backgroundColor: theme.colors.primary,
    marginHorizontal: theme.spacing.lg, marginTop: 16,
    paddingVertical: 14, borderRadius: theme.radii.pill, alignItems: "center",
  },
  newBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
  popupOverlay: {
    flex: 1, backgroundColor: theme.colors.overlay,
    justifyContent: "center", alignItems: "center", padding: theme.spacing.lg,
  },
  popupCard: {
    backgroundColor: theme.colors.surface, width: "100%", maxWidth: 320,
    borderRadius: theme.radii.xl, padding: theme.spacing.lg, alignItems: "center", gap: 8,
  },
  popupIcon: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: "rgba(16,185,129,0.12)",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  popupTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text, textAlign: "center" },
  popupPoints: { fontSize: 26, fontWeight: "900", color: theme.colors.primary, marginTop: 4 },
  popupBtn: {
    marginTop: 16, backgroundColor: theme.colors.primary,
    paddingHorizontal: 36, paddingVertical: 14, borderRadius: theme.radii.pill,
  },
  popupBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
