import { Ionicons } from "@expo/vector-icons";
import { useSegments, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, radius, shadow, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

function pageTitle(segments: string[]): string {
  const parts = segments.filter((s) => !s.startsWith("("));
  if (parts.length === 0 || parts[0] === "index") return "Home";
  const [a, b] = parts;
  switch (a) {
    case "fees":
      return "Fees";
    case "rooms":
      return "Rooms";
    case "students":
      return "Students";
    case "users":
      return "Accounts";
    case "profile":
      return "Profile";
    case "notify":
      return "Send notification";
    case "settings":
      return "PG profile";
    case "student":
      return b === "new" ? "Add student" : "Student";
    case "leave":
      return b === "new" ? "Apply for leave" : "Leave request";
    case "messages":
      return "Messages";
    case "message":
      return b === "new" ? "New message" : "Message";
    case "status-videos":
      return "Check-in videos";
    case "status-video":
      return b === "record" ? "Record video" : "Video";
    case "user":
      return "Account";
    default: {
      const cap = a.charAt(0).toUpperCase() + a.slice(1);
      return cap.replace(/-/g, " ");
    }
  }
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

export function TopBar() {
  const { colors, isDark, toggle } = useTheme();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const router = useRouter();
  const now = useNow();
  const onTabs = segments[0] === "(tabs)";
  const showBack = !onTabs && router.canGoBack();

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: insets.top + space(2),
          paddingBottom: space(2),
          backgroundColor: colors.card,
          borderBottomColor: colors.border,
        },
        shadow.sm,
      ]}
    >
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: colors.cardAlt },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="chevron-back" color={colors.text} size={20} />
          </Pressable>
        ) : null}

        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.title, { color: colors.text }]}>
          {pageTitle(segments)}
        </Text>

        <View style={[styles.clock, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
          <Ionicons name="time-outline" color={colors.primary} size={14} />
          <Text style={[styles.time, { color: colors.text }]}>{formatTime(now)}</Text>
          <Text style={[styles.date, { color: colors.muted }]}>{formatDate(now)}</Text>
        </View>

        <Pressable
          onPress={toggle}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: colors.primarySoft },
            pressed && styles.pressed,
          ]}
          accessibilityLabel="Toggle dark mode"
        >
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} color={colors.primary} size={20} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: space(4),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
    minHeight: 44,
  },
  title: {
    flex: 1,
    fontSize: fonts.header,
    fontWeight: "800",
  },
  clock: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1.5),
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  time: {
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  date: {
    fontSize: 11,
    fontWeight: "600",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.85,
  },
});