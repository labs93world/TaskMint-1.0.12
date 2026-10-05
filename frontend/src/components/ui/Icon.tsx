import React from "react";
import {
  House,
  Wallet,
  User,
  Coins,
  CaretRight,
  CaretLeft,
  CaretDown,
  CaretUp,
  X,
  Gift,
  Sparkle,
  Star,
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  Info,
  ArrowLeft,
  Gear,
  Question,
  FileText,
  ShieldCheck,
  Trophy,
  Target,
  Brain,
  GridFour,
  Hand,
  Plus,
  PencilSimple,
  PushPin,
  Eye,
  EyeSlash,
  Trash,
  ArrowClockwise,
  WifiSlash,
  ClipboardText,
  IconWeight,
} from "phosphor-react-native";

const MAP = {
  house: House,
  wallet: Wallet,
  user: User,
  coins: Coins,
  "caret-right": CaretRight,
  "caret-left": CaretLeft,
  "caret-down": CaretDown,
  "caret-up": CaretUp,
  x: X,
  gift: Gift,
  sparkle: Sparkle,
  star: Star,
  "check-circle": CheckCircle,
  "x-circle": XCircle,
  clock: Clock,
  copy: Copy,
  info: Info,
  "arrow-left": ArrowLeft,
  gear: Gear,
  question: Question,
  "file-text": FileText,
  shield: ShieldCheck,
  trophy: Trophy,
  target: Target,
  brain: Brain,
  grid: GridFour,
  hand: Hand,
  plus: Plus,
  pencil: PencilSimple,
  pin: PushPin,
  eye: Eye,
  "eye-slash": EyeSlash,
  trash: Trash,
  refresh: ArrowClockwise,
  "wifi-slash": WifiSlash,
  clipboard: ClipboardText,
} as const;

export type IconName = keyof typeof MAP;

export function Icon({
  name,
  size = 22,
  color,
  weight = "regular",
}: {
  name: IconName;
  size?: number;
  color: string;
  weight?: IconWeight;
}) {
  const Cmp = MAP[name];
  return <Cmp size={size} color={color} weight={weight} />;
}
