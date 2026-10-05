import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/src/theme";
import { Icon, IconName } from "./Icon";

type ToastType = "success" | "error" | "info";
type ToastCtx = { show: (msg: string, type?: ToastType) => void };

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState("");
  const [type, setType] = useState<ToastType>("info");
  const [mounted, setMounted] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (m: string, t: ToastType = "info") => {
      setMsg(m);
      setType(t);
      setMounted(true);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(() => setMounted(false));
      }, 2400);
    },
    [opacity],
  );

  const bg =
    type === "success"
      ? colors.success
      : type === "error"
        ? colors.error
        : colors.surfaceInverse;
  const icon: IconName =
    type === "success" ? "check-circle" : type === "error" ? "x-circle" : "info";

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {mounted && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.wrap,
            { top: insets.top + 12, opacity },
          ]}
        >
          <View style={[styles.toast, { backgroundColor: bg }]} testID="app-toast">
            <Icon name={icon} size={20} color="#FFFFFF" weight="fill" />
            <Text style={styles.text}>{msg}</Text>
          </View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 16,
    zIndex: 9999,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    maxWidth: 460,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", flexShrink: 1 },
});
