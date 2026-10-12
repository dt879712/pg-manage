import { useEffect, useRef, useState } from "react";
import { Animated, FlatList, Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Badge, Card, Muted, Row, SkeletonCard } from "@/components/ui";
import { Avatar } from "@/components/documents";
import { shortDate } from "@/lib/format";
import { radius, shadow, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { AppNotification, TenantBranding, TenantImage } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const carouselStyles = StyleSheet.create({
  frame: {
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  counter: {
    position: "absolute",
    top: space(2),
    right: space(2),
    backgroundColor: "rgba(2,6,15,0.55)",
    paddingHorizontal: space(2),
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  counterText: { color: "#FFF", fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: space(3), gap: space(2) },
  caption: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  dots: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "center" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.45)" },
  dotActive: { width: 18, backgroundColor: "#FFFFFF" },
});

export function ImageCarousel({
  images,
  height,
  width: widthProp,
}: {
  images: TenantImage[];
  height?: number;
  width?: number;
}) {
  const { colors } = useTheme();
  const { width, height: screenHeight } = useWindowDimensions();
  const itemWidth = widthProp ?? width - space(4) * 4;
  const imageHeight = height ?? Math.round(Math.min(itemWidth * 0.95, screenHeight * 0.68));
  const parallax = Math.round(itemWidth * 0.18);
  const listRef = useRef<FlatList<TenantImage>>(null);
  const [scrollX] = useState(() => new Animated.Value(0));
  const [index, setIndex] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);

  useEffect(() => {
    if (images.length < 2) return;
    const timer = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % images.length;
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 3500);
    return () => clearInterval(timer);
  }, [images.length]);

  return (
    <View style={{ gap: space(2) }}>
      <Animated.FlatList
        ref={listRef}
        data={images}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: itemWidth, offset: itemWidth * i, index: i })}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
        })}
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / itemWidth))
        }
        onScrollToIndexFailed={() => undefined}
        renderItem={({ item, index: i }) => {
          const inputRange = [(i - 1) * itemWidth, i * itemWidth, (i + 1) * itemWidth];
          const translateX = scrollX.interpolate({
            inputRange,
            outputRange: [parallax, 0, -parallax],
            extrapolate: "clamp",
          });
          return (
            <Pressable
              onPress={() => setViewing(item.imageUrl)}
              style={[
                carouselStyles.frame,
                { width: itemWidth, height: imageHeight, borderColor: colors.border, backgroundColor: colors.cardAlt },
                shadow.md,
              ]}
            >
              <Animated.Image
                source={{ uri: item.imageUrl }}
                resizeMode="cover"
                style={{
                  position: "absolute",
                  left: -parallax,
                  width: itemWidth + parallax * 2,
                  height: imageHeight,
                  transform: [{ translateX }],
                }}
              />
              <LinearGradient
                colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.8)"]}
                locations={[0.35, 0.72, 1]}
                style={StyleSheet.absoluteFill}
              />
              {images.length > 1 ? (
                <View style={carouselStyles.counter}>
                  <Text style={carouselStyles.counterText}>
                    {i + 1}/{images.length}
                  </Text>
                </View>
              ) : null}
              <View style={carouselStyles.footer} pointerEvents="none">
                {item.caption ? (
                  <Text numberOfLines={2} style={carouselStyles.caption}>
                    {item.caption}
                  </Text>
                ) : null}
                {images.length > 1 ? (
                  <View style={carouselStyles.dots}>
                    {images.map((img, di) => (
                      <View
                        key={img.id}
                        style={[carouselStyles.dot, di === index ? carouselStyles.dotActive : null]}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable
          onPress={() => setViewing(null)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center", padding: space(4) }}
        >
          {viewing ? (
            <Image source={{ uri: viewing }} resizeMode="contain" style={{ width: "100%", height: "85%" }} />
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

export function TenantBanner({ tenant }: { tenant?: TenantBranding | null }) {
  const { colors } = useTheme();
  const { data, loading } = useApi<{ tenant: TenantBranding }>("/tenant");
  const { width } = useWindowDimensions();
  const t = tenant ?? data?.tenant;
  if (!t) return loading ? <SkeletonCard lines={3} /> : null;

  const place = [t.address, t.city].filter(Boolean).join(", ");
  const inner = width - space(4) * 2;

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <View style={{ padding: space(4), gap: space(2) }}>
        <Row style={{ gap: space(3) }}>
          <Avatar uri={t.logoUrl} name={t.name} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text }}>{t.name}</Text>
            {place ? <Muted>{place}</Muted> : null}
          </View>
        </Row>
        {t.description ? <Text style={{ color: colors.muted }}>{t.description}</Text> : null}
      </View>
      {t.images?.length ? (
        <View style={{ paddingBottom: space(4) }}>
          <ImageCarousel images={t.images} width={inner} />
        </View>
      ) : null}
    </Card>
  );
}

export function AnnouncementsCard({ take = 3 }: { take?: number }) {
  const { colors } = useTheme();
  const { data, loading } = useApi<{ notifications: AppNotification[] }>("/notifications");
  const list = (data?.notifications ?? []).slice(0, take);
  if (list.length === 0) return loading ? <SkeletonCard lines={2} /> : null;

  return (
    <Card style={{ gap: space(3) }}>
      <Text style={{ fontWeight: "700", color: colors.text }}>Announcements</Text>
      {list.map((n) => (
        <View key={n.id} style={{ gap: 2 }}>
          <Row between>
            <Text style={{ color: colors.text, fontWeight: "600", flex: 1 }}>{n.title}</Text>
            {!n.readAt ? <Badge label="New" tone="primary" /> : null}
          </Row>
          <Text style={{ color: colors.muted }}>{n.body}</Text>
          <Muted>{shortDate(n.createdAt)}</Muted>
        </View>
      ))}
    </Card>
  );
}
