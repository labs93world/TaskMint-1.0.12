import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";

import { makeStyles } from "@/src/theme";
import { Banner } from "@/src/lib/firestore";

const H_PADDING = 16;

export function BannerCarousel({ banners }: { banners: Banner[] }) {
  const styles = useStyles();
  const { width: screenW } = useWindowDimensions();
  const cardWidth = screenW - H_PADDING * 2;
  const bannerHeight = Math.round(cardWidth * 0.46);
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Banner>>(null);

  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % banners.length;
        listRef.current?.scrollToOffset({ offset: next * screenW, animated: true });
        return next;
      });
    }, 3500);
    return () => clearInterval(t);
  }, [banners.length, screenW]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / screenW);
    if (i !== index) setIndex(i);
  };

  if (!banners.length) return null;

  return (
    <View>
      <FlatList
        ref={listRef}
        data={banners}
        keyExtractor={(b) => b.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={screenW}
        onMomentumScrollEnd={onScroll}
        renderItem={({ item }) => (
          <Pressable
            testID={`banner-${item.id}`}
            style={{ width: screenW, paddingHorizontal: H_PADDING }}
            onPress={() => {
              if (item.redirectUrl) {
                WebBrowser.openBrowserAsync(item.redirectUrl).catch(() => {});
              }
            }}
          >
            <Image
              source={{ uri: item.imageUrl }}
              style={[styles.image, { width: cardWidth, height: bannerHeight }]}
              contentFit="cover"
              transition={200}
            />
          </Pressable>
        )}
      />
      {banners.length > 1 && (
        <View style={styles.dots}>
          {banners.map((b, i) => (
            <View
              key={b.id}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  image: { borderRadius: 20, backgroundColor: c.surfaceTertiary },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.borderStrong,
  },
  dotActive: { width: 20, backgroundColor: c.brandSecondary },
}));
