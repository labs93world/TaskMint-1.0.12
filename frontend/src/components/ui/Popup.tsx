import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { makeStyles, useTheme } from "@/src/theme";
import { Icon } from "./Icon";

export function Popup({
  visible,
  onClose,
  title,
  children,
  testID,
  dismissable = true,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  testID?: string;
  dismissable?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={dismissable ? onClose : undefined}
      >
        <Pressable style={styles.card} testID={testID} onPress={() => {}}>
          {(title || dismissable) && (
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={2}>
                {title ?? ""}
              </Text>
              {dismissable && (
                <Pressable
                  onPress={onClose}
                  hitSlop={10}
                  testID="popup-close"
                  style={styles.closeBtn}
                >
                  <Icon name="x" size={18} color={colors.onSurfaceSecondary} weight="bold" />
                </Pressable>
              )}
            </View>
          )}
          <ScrollView
            style={{ maxHeight: 480 }}
            contentContainerStyle={{ padding: 20, paddingTop: title ? 4 : 20 }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: c.surfaceSecondary,
    borderRadius: 24,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: c.onSurfaceSecondary },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surfaceTertiary,
  },
}));
