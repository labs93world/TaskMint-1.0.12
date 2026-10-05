import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/components/ui/Icon";
import { GameApi } from "./GameShell";

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// --------------------------------- Higher / Lower ----------------------------
// 1 chance = a set of 5 questions. +50 points per correct guess.
export function HigherLower({ api }: { api: GameApi; reward: number }) {
  const s = useStyles();
  const [active, setActive] = useState(false);
  const [current, setCurrent] = useState(25);
  const [qLeft, setQLeft] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [msg, setMsg] = useState("");

  const start = () => {
    if (!api.consumeChance()) return;
    setCurrent(rand(2, 49));
    setQLeft(5);
    setCorrect(0);
    setMsg("Higher or lower than this number?");
    setActive(true);
  };

  const guess = (dir: "higher" | "lower") => {
    if (!active || qLeft <= 0) return;
    const next = rand(1, 50);
    const ok = dir === "higher" ? next > current : next < current;
    const newCorrect = correct + (ok ? 1 : 0);
    const left = qLeft - 1;
    setCurrent(next);
    setCorrect(newCorrect);
    setQLeft(left);
    setMsg(`Next was ${next} — ${ok ? "Correct! +40" : "Wrong"}`);
    if (left <= 0) {
      setActive(false);
      if (newCorrect > 0) api.win(newCorrect * 40, "Higher Lower");
      else api.notify("No correct guesses this set", "error");
    }
  };

  if (!active) {
    return <StartPanel label="1 chance = 5 questions. Win +40 points per correct guess!" onStart={start} testID="hl-start" />;
  }

  return (
    <View style={s.center}>
      <Text style={s.counter}>Question {6 - qLeft}/5 · Correct {correct}</Text>
      <Text style={s.hint}>{msg}</Text>
      <View style={s.bigNumber}>
        <Text style={s.bigNumberText}>{current}</Text>
      </View>
      <View style={s.rowBtns}>
        <Pressable testID="hl-higher" style={[s.actionBtn, s.higher]} onPress={() => guess("higher")}>
          <Icon name="caret-right" size={22} color="#FFFFFF" weight="bold" />
          <Text style={s.actionText}>Higher</Text>
        </Pressable>
        <Pressable testID="hl-lower" style={[s.actionBtn, s.lower]} onPress={() => guess("lower")}>
          <Icon name="caret-down" size={22} color="#FFFFFF" weight="bold" />
          <Text style={s.actionText}>Lower</Text>
        </Pressable>
      </View>
    </View>
  );
}

// --------------------------------- Memory Match ------------------------------
// Random reward 150-200 on completing all pairs.
const EMOJIS = ["🍎", "⭐", "🎁", "💎", "🚀", "🔥"];
function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function MemoryMatch({ api }: { api: GameApi; reward: number }) {
  const s = useStyles();
  const [cards, setCards] = useState<{ val: string; flipped: boolean; matched: boolean }[]>([]);
  const [first, setFirst] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);

  const deal = () => {
    if (!api.consumeChance()) return;
    const deck = shuffle([...EMOJIS, ...EMOJIS]).map((v) => ({ val: v, flipped: false, matched: false }));
    setCards(deck);
    setFirst(null);
    setPlaying(true);
  };

  const flip = (i: number) => {
    if (busy || cards[i].flipped || cards[i].matched) return;
    const next = cards.slice();
    next[i] = { ...next[i], flipped: true };
    setCards(next);
    if (first === null) {
      setFirst(i);
    } else {
      setBusy(true);
      const match = next[first].val === next[i].val;
      setTimeout(() => {
        const after = next.slice();
        if (match) {
          after[first] = { ...after[first], matched: true };
          after[i] = { ...after[i], matched: true };
        } else {
          after[first] = { ...after[first], flipped: false };
          after[i] = { ...after[i], flipped: false };
        }
        setCards(after);
        setFirst(null);
        setBusy(false);
        if (match && after.every((c) => c.matched)) {
          setPlaying(false);
          api.win(rand(150, 200), "Memory Match");
        }
      }, 650);
    }
  };

  if (!playing) {
    return <StartPanel label="Flip and match all 6 pairs to win 150-200 points!" onStart={deal} testID="memory-start" />;
  }

  return (
    <View style={s.center}>
      <View style={s.memGrid}>
        {cards.map((c, i) => (
          <Pressable key={i} testID={`mem-card-${i}`} style={[s.memCard, (c.flipped || c.matched) && s.memCardUp]} onPress={() => flip(i)}>
            <Text style={s.memVal}>{c.flipped || c.matched ? c.val : "?"}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// --------------------------------- Tic Tac Toe -------------------------------
// 3 modes: easy(80) / medium(130) / hard(200).
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
function winner(b: (string | null)[]): string | null {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return null;
}
function emptyCells(b: (string | null)[]) {
  return b.map((v, i) => (v ? null : i)).filter((v) => v !== null) as number[];
}
function findBest(b: (string | null)[], who: string): number | null {
  for (const i of emptyCells(b)) {
    const copy = b.slice();
    copy[i] = who;
    if (winner(copy) === who) return i;
  }
  return null;
}
function minimax(b: (string | null)[], ai: string, human: string, turn: string): { score: number; move: number } {
  const w = winner(b);
  if (w === ai) return { score: 10, move: -1 };
  if (w === human) return { score: -10, move: -1 };
  const cells = emptyCells(b);
  if (cells.length === 0) return { score: 0, move: -1 };
  let best = turn === ai ? { score: -Infinity, move: -1 } : { score: Infinity, move: -1 };
  for (const i of cells) {
    const copy = b.slice();
    copy[i] = turn;
    const res = minimax(copy, ai, human, turn === ai ? human : ai);
    if (turn === ai) {
      if (res.score > best.score) best = { score: res.score, move: i };
    } else {
      if (res.score < best.score) best = { score: res.score, move: i };
    }
  }
  return best;
}
function aiMove(b: (string | null)[], mode: string): number {
  const cells = emptyCells(b);
  if (mode === "easy") return cells[rand(0, cells.length - 1)];
  if (mode === "medium") {
    return findBest(b, "O") ?? findBest(b, "X") ?? cells[rand(0, cells.length - 1)];
  }
  return minimax(b, "O", "X", "O").move;
}

export function TicTacToe({ api }: { api: GameApi; reward: number }) {
  const s = useStyles();
  const { colors } = useTheme();
  const [mode, setMode] = useState<string | null>(null);
  const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null));
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState("");

  const rewardFor = (m: string) => (m === "easy" ? 100 : m === "medium" ? 150 : 200);

  const start = (m: string) => {
    if (!api.consumeChance()) return;
    setMode(m);
    setBoard(Array(9).fill(null));
    setStatus("Your turn (X)");
    setPlaying(true);
  };

  const play = (i: number) => {
    if (!playing || board[i] || !mode) return;
    const b = board.slice();
    b[i] = "X";
    if (winner(b)) return end(b, "win");
    if (b.every(Boolean)) return end(b, "draw");
    const move = aiMove(b, mode);
    b[move] = "O";
    if (winner(b) === "O") return end(b, "lose");
    if (b.every(Boolean)) return end(b, "draw");
    setBoard(b);
  };

  const end = (b: (string | null)[], result: "win" | "lose" | "draw") => {
    setBoard(b);
    setPlaying(false);
    if (result === "win") {
      setStatus("You won! 🎉");
      api.win(rewardFor(mode!), "Tic-Tac-Toe");
    } else if (result === "lose") {
      setStatus("Bot won. Try again!");
      api.notify("Bot won this round", "error");
    } else {
      setStatus("It's a draw!");
      api.notify("It's a draw", "info");
    }
  };

  if (!mode && !board.some(Boolean)) {
    return (
      <View style={s.center}>
        <View style={s.startIcon}>
          <Icon name="hand" size={48} color={colors.brand} weight="fill" />
        </View>
        <Text style={s.startLabel}>Pick a difficulty to play (1 chance each)</Text>
        <View style={{ gap: 12, width: "100%", paddingHorizontal: 20 }}>
          <ModeBtn label="Easy" reward={100} color={colors.success} onPress={() => start("easy")} testID="ttt-easy" />
          <ModeBtn label="Medium" reward={150} color={colors.warning} onPress={() => start("medium")} testID="ttt-medium" />
          <ModeBtn label="Hard" reward={200} color={colors.error} onPress={() => start("hard")} testID="ttt-hard" />
        </View>
      </View>
    );
  }

  return (
    <View style={s.center}>
      <Text style={s.hint}>{status}</Text>
      <View style={s.tttGrid}>
        {board.map((v, i) => (
          <Pressable key={i} testID={`ttt-cell-${i}`} style={s.tttCell} onPress={() => play(i)}>
            <Text style={[s.tttVal, { color: v === "X" ? colors.brand : colors.error }]}>{v}</Text>
          </Pressable>
        ))}
      </View>
      {!playing && (
        <Pressable
          testID="ttt-new"
          style={s.newGameBtn}
          onPress={() => {
            setMode(null);
            setBoard(Array(9).fill(null));
          }}
        >
          <Text style={s.newGameText}>Choose difficulty again</Text>
        </Pressable>
      )}
    </View>
  );
}

function ModeBtn({ label, reward, color, onPress, testID }: { label: string; reward: number; color: string; onPress: () => void; testID: string }) {
  const s = useStyles();
  return (
    <Pressable testID={testID} style={[s.modeBtn, { borderColor: color }]} onPress={onPress}>
      <Text style={[s.modeLabel, { color }]}>{label}</Text>
      <Text style={s.modeReward}>Win {reward} pts</Text>
    </Pressable>
  );
}

// --------------------------------- Catch Rewards (falling) -------------------
const COLLECTIBLES = ["⭐", "🪙", "🍀", "☃️", "🐦", "🍇", "💴", "🧲", "💲"];
const GIFTS = ["💎", "🎁"];
const BOMBS = ["💣", "☠️"];
type FallItem = { id: number; emoji: string; kind: "coin" | "gift" | "bomb"; x: number; y: number; speed: number };

export function CatchRewards({ api }: { api: GameApi; reward: number }) {
  const s = useStyles();
  const { width } = useWindowDimensions();
  const arenaW = width - 32;
  const ARENA_H = 420;
  const ITEM = 44;

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(20);
  const [score, setScore] = useState(0);
  const [items, setItems] = useState<FallItem[]>([]);
  const idRef = useRef(0);
  const scoreRef = useRef(0);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAll = () => {
    if (loopRef.current) clearInterval(loopRef.current);
    if (spawnRef.current) clearInterval(spawnRef.current);
    if (timeRef.current) clearInterval(timeRef.current);
  };

  const finish = (won: boolean) => {
    clearAll();
    setPlaying(false);
    setItems([]);
    const total = scoreRef.current;
    if (total > 0) api.win(total, "Catch Rewards");
    else api.notify("No rewards caught this time", "error");
  };

  const start = () => {
    if (!api.consumeChance()) return;
    scoreRef.current = 0;
    idRef.current = 0;
    setScore(0);
    setItems([]);
    setTime(20);
    setPlaying(true);

    spawnRef.current = setInterval(() => {
      const r = Math.random();
      let kind: FallItem["kind"];
      let emoji: string;
      if (r < 0.18) {
        kind = "bomb";
        emoji = BOMBS[rand(0, BOMBS.length - 1)];
      } else if (r < 0.33) {
        kind = "gift";
        emoji = GIFTS[rand(0, GIFTS.length - 1)];
      } else {
        kind = "coin";
        emoji = COLLECTIBLES[rand(0, COLLECTIBLES.length - 1)];
      }
      const item: FallItem = {
        id: idRef.current++,
        emoji,
        kind,
        x: Math.random() * (arenaW - ITEM),
        y: -ITEM,
        speed: rand(5, 9),
      };
      setItems((prev) => [...prev, item]);
    }, 650);

    loopRef.current = setInterval(() => {
      setItems((prev) =>
        prev
          .map((it) => ({ ...it, y: it.y + it.speed }))
          .filter((it) => it.y < ARENA_H + ITEM),
      );
    }, 40);

    timeRef.current = setInterval(() => {
      setTime((t) => {
        if (t <= 1) {
          finish(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  useEffect(() => () => clearAll(), []);

  const tap = (it: FallItem) => {
    setItems((prev) => prev.filter((x) => x.id !== it.id));
    if (it.kind === "bomb") {
      api.notify("💥 Boom! You hit a bomb", "error");
      finish(false);
      return;
    }
    const pts = it.kind === "gift" ? 10 : 5;
    scoreRef.current += pts;
    setScore(scoreRef.current);
  };

  if (!playing) {
    return <StartPanel label="Tap gifts & coins, AVOID bombs! Hitting a bomb ends the round." onStart={start} testID="catch-start" />;
  }

  return (
    <View style={s.center}>
      <View style={s.tapStats}>
        <Text style={s.tapStat}>⏱ {time}s</Text>
        <Text style={s.tapStat}>🏆 {score}</Text>
      </View>
      <View style={[s.tapArena, { height: ARENA_H }]} testID="catch-arena">
        {items.map((it) => (
          <Pressable
            key={it.id}
            testID={`fall-${it.kind}`}
            onPress={() => tap(it)}
            style={[s.fallItem, { left: it.x, top: it.y }]}
          >
            <Text style={s.fallEmoji}>{it.emoji}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// --------------------------------- Solve & Earn ------------------------------
// 1 chance = 5 questions, 3s to answer each question, +50 per correct.
export function SolveEarn({ api }: { api: GameApi; reward: number }) {
  const s = useStyles();
  const { colors } = useTheme();
  const [active, setActive] = useState(false);
  const [qLeft, setQLeft] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [timer, setTimer] = useState(3);
  const [q, setQ] = useState<{ text: string; answer: number; options: number[] } | null>(null);
  const tRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const correctRef = useRef(0);
  const qLeftRef = useRef(0);

  const clearTimer = () => {
    if (tRef.current) clearInterval(tRef.current);
  };

  const advance = (ok: boolean | null) => {
    clearTimer();
    const newCorrect = correctRef.current + (ok ? 1 : 0);
    const left = qLeftRef.current - 1;
    correctRef.current = newCorrect;
    qLeftRef.current = left;
    setCorrect(newCorrect);
    setQLeft(left);
    api.notify(
      ok === null ? "Time's up! ⏰" : ok ? "Correct! +50" : "Wrong answer",
      ok === true ? "success" : "error",
    );
    if (left <= 0) {
      setActive(false);
      setQ(null);
      if (newCorrect > 0) api.win(newCorrect * 50, "Solve & Earn");
      else api.notify("No correct answers this set", "error");
    } else {
      makeQuestion();
    }
  };

  const startTimer = () => {
    clearTimer();
    setTimer(3);
    let t = 3;
    tRef.current = setInterval(() => {
      t -= 1;
      setTimer(t);
      if (t <= 0) advance(null); // ran out of time counts as a miss
    }, 1000);
  };

  const makeQuestion = () => {
    const a = rand(2, 12);
    const b = rand(2, 12);
    const op = Math.random() > 0.5 ? "+" : "×";
    const answer = op === "+" ? a + b : a * b;
    const opts = new Set<number>([answer]);
    while (opts.size < 4) opts.add(answer + rand(-10, 10) || answer + 1);
    setQ({ text: `${a} ${op} ${b} = ?`, answer, options: shuffle([...opts]) });
    startTimer();
  };

  const start = () => {
    if (!api.consumeChance()) return;
    correctRef.current = 0;
    qLeftRef.current = 5;
    setActive(true);
    setQLeft(5);
    setCorrect(0);
    makeQuestion();
  };

  const answer = (v: number) => {
    if (!q) return;
    advance(v === q.answer);
  };

  useEffect(() => () => clearTimer(), []);

  if (!active) {
    return <StartPanel label="1 chance = 5 questions. Answer each within 3s. +50 per correct!" onStart={start} testID="solve-start" />;
  }

  if (!q) {
    return (
      <View style={s.center}>
        <Text style={s.counter}>Correct {correct}/5</Text>
      </View>
    );
  }

  return (
    <View style={s.center}>
      <Text style={s.counter}>Question {6 - qLeft}/5 · Correct {correct}</Text>
      <View style={[s.timerPill, { borderColor: timer <= 1 ? colors.error : colors.brand }]}>
        <Text style={[s.timerText, { color: timer <= 1 ? colors.error : colors.brand }]}>{timer}s</Text>
      </View>
      <View style={s.questionBox}>
        <Text style={s.question}>{q.text}</Text>
      </View>
      <View style={s.optGrid}>
        {q.options.map((o, i) => (
          <Pressable key={i} testID={`solve-opt-${i}`} style={s.optBtn} onPress={() => answer(o)}>
            <Text style={s.optText}>{o}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// --------------------------------- Shared Start panel ------------------------
function StartPanel({ label, onStart, testID }: { label: string; onStart: () => void; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.center}>
      <View style={s.startIcon}>
        <Icon name="trophy" size={48} color={colors.brand} weight="fill" />
      </View>
      <Text style={s.startLabel}>{label}</Text>
      <Pressable testID={testID} style={s.startBtn} onPress={onStart}>
        <Text style={s.startBtnText}>Start (1 chance)</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  counter: { fontSize: 14, fontWeight: "800", color: c.brand },
  hint: { fontSize: 16, fontWeight: "700", color: c.onSurfaceTertiary, textAlign: "center" },
  cooldown: { fontSize: 20, fontWeight: "800", color: c.onSurfaceSecondary },
  timerPill: {
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 6,
    backgroundColor: c.surfaceSecondary,
  },
  timerText: { fontSize: 18, fontWeight: "800" },
  bigNumber: {
    width: 140,
    height: 140,
    borderRadius: 32,
    backgroundColor: c.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  bigNumberText: { fontSize: 56, fontWeight: "800", color: c.brandPrimary },
  rowBtns: { flexDirection: "row", gap: 14 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 26, borderRadius: 999 },
  higher: { backgroundColor: c.success },
  lower: { backgroundColor: c.error },
  actionText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },

  memGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12, maxWidth: 320 },
  memCard: { width: 68, height: 84, borderRadius: 16, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  memCardUp: { backgroundColor: c.surfaceSecondary, borderWidth: 2, borderColor: c.brand },
  memVal: { fontSize: 30 },

  tttGrid: { flexDirection: "row", flexWrap: "wrap", width: 300, gap: 8, justifyContent: "center" },
  tttCell: { width: 92, height: 92, borderRadius: 16, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  tttVal: { fontSize: 44, fontWeight: "800" },
  newGameBtn: { marginTop: 4, backgroundColor: c.brandTertiary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999 },
  newGameText: { color: c.brand, fontWeight: "800" },
  modeBtn: {
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: c.surfaceSecondary,
  },
  modeLabel: { fontSize: 18, fontWeight: "800" },
  modeReward: { fontSize: 14, fontWeight: "700", color: c.muted },

  tapStats: { flexDirection: "row", gap: 24 },
  tapStat: { fontSize: 22, fontWeight: "800", color: c.onSurface },
  tapArena: { width: "100%", borderRadius: 24, backgroundColor: c.surfaceSecondary, overflow: "hidden" },
  fallItem: { position: "absolute", width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  fallEmoji: { fontSize: 34 },

  questionBox: {
    paddingVertical: 28,
    paddingHorizontal: 40,
    borderRadius: 24,
    backgroundColor: c.surfaceSecondary,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  question: { fontSize: 36, fontWeight: "800", color: c.brandPrimary },
  optGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12, maxWidth: 300 },
  optBtn: { width: 130, height: 64, borderRadius: 16, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  optText: { fontSize: 24, fontWeight: "800", color: c.brand },

  startIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  startLabel: { fontSize: 16, fontWeight: "700", color: c.onSurfaceTertiary, textAlign: "center", paddingHorizontal: 20 },
  startBtn: { backgroundColor: c.brandPrimary, paddingVertical: 15, paddingHorizontal: 32, borderRadius: 999 },
  startBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
}));
