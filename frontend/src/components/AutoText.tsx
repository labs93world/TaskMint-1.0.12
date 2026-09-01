import React from "react";
import { Text, TextProps } from "react-native";

/**
 * AutoText — a drop-in <Text> replacement that auto-shrinks its font to fit
 * without wrapping/overflowing. Uses RN's built-in adjustsFontSizeToFit +
 * numberOfLines so it works identically on iOS, Android and web.
 *
 * Usage: <AutoText style={styles.big} numberOfLines={1}>{value}</AutoText>
 */
export default function AutoText({
  numberOfLines = 1,
  minimumFontScale = 0.6,
  children,
  ...rest
}: TextProps & { minimumFontScale?: number }) {
  return (
    <Text
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit
      minimumFontScale={minimumFontScale}
      {...rest}
    >
      {children}
    </Text>
  );
}
