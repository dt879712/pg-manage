import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { fonts, radius, shadow, space, type ThemeColors } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[s.screen, { backgroundColor: colors.bg }, style]}>{children}</View>;
}

export function Card({
  children,
  style,
  tone,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "plain" | "soft";
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        s.card,
        tone === "soft"
          ? { backgroundColor: colors.cardAlt, borderColor: colors.border }
          : { backgroundColor: colors.card, borderColor: colors.border },
        shadow.sm,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[s.heading, { color: colors.text }]}>{children}</Text>;
}

export function Muted({ children, ...props }: TextProps) {
  const { colors } = useTheme();
  return (
    <Text style={[s.muted, { color: colors.muted }]} {...props}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={s.sectionTitleRow}>
      <View style={[s.sectionTitleBar, { backgroundColor: colors.primary }]} />
      <Text style={[s.sectionTitle, { color: colors.text }]}>{children}</Text>
    </View>
  );
}

export function Row({
  children,
  style,
  between,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  between?: boolean;
}) {
  return <View style={[s.row, between && s.rowBetween, style]}>{children}</View>;
}

type Variant = "primary" | "success" | "danger" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  icon,
  block,
  size = "md",
  alignSelf,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: IoniconName;
  block?: boolean;
  size?: "sm" | "md";
  alignSelf?: "auto" | "flex-start" | "center" | "flex-end" | "stretch";
}) {
  const { colors } = useTheme();
  const v =
    variant === "primary"
      ? { bg: colors.primarySolid, fg: colors.onPrimary }
      : variant === "success"
        ? { bg: colors.successSolid, fg: "#FFFFFF" }
        : variant === "danger"
          ? { bg: colors.dangerSolid, fg: "#FFFFFF" }
          : { bg: colors.primarySoft, fg: colors.primary };
  const dim = disabled || loading;
  const sm = size === "sm";
  const selfAlign = alignSelf ?? (sm ? "flex-start" : undefined);
  return (
    <Pressable
      onPress={onPress}
      disabled={dim}
      style={({ pressed }) => [
        s.button,
        sm && s.buttonSm,
        { backgroundColor: v.bg },
        selfAlign ? { alignSelf: selfAlign } : null,
        block && s.buttonBlock,
        pressed && !dim && s.buttonPressed,
        dim && s.buttonDim,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} size="small" />
      ) : (
        <View style={s.buttonInner}>
          {icon ? <Ionicons name={icon} color={v.fg} size={sm ? 15 : 18} /> : null}
          <Text style={[s.buttonText, sm && s.buttonTextSm, { color: v.fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export type Tone = "neutral" | "success" | "warning" | "danger" | "primary";

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const { colors } = useTheme();
  const t =
    tone === "success"
      ? { bg: colors.successSoft, fg: colors.success }
      : tone === "warning"
        ? { bg: colors.warningSoft, fg: colors.warning }
        : tone === "danger"
          ? { bg: colors.dangerSoft, fg: colors.danger }
          : tone === "primary"
            ? { bg: colors.primarySoft, fg: colors.primary }
            : { bg: colors.cardAlt, fg: colors.muted };
  return (
    <View style={[s.badge, { backgroundColor: t.bg }]}>
      <Text style={[s.badgeText, { color: t.fg }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const statTone: Record<Tone, { fg: keyof ThemeColors; soft: keyof ThemeColors }> = {
  primary: { fg: "primary", soft: "primarySoft" },
  neutral: { fg: "text", soft: "cardAlt" },
  success: { fg: "success", soft: "successSoft" },
  warning: { fg: "warning", soft: "warningSoft" },
  danger: { fg: "danger", soft: "dangerSoft" },
};

const statIcons: Record<Tone, IoniconName> = {
  primary: "analytics",
  neutral: "sparkles",
  success: "checkmark-circle",
  warning: "warning",
  danger: "alert-circle",
};

export function Stat({
  label,
  value,
  tone = "primary",
  icon,
  onPress,
  active,
}: {
  label: string;
  value: string | number;
  tone?: Tone;
  icon?: IoniconName;
  onPress?: () => void;
  active?: boolean;
}) {
  const { colors } = useTheme();
  const t = statTone[tone];
  const fg = colors[t.fg];
  const soft = colors[t.soft];
  const chip = icon ?? statIcons[tone];
  const card = (
    <View
      style={[
        s.stat,
        {
          backgroundColor: soft,
          borderColor: active ? colors.primary : colors.border,
          borderWidth: active ? 2 : 1,
        },
        shadow.sm,
      ]}
    >
      <View style={s.statTop}>
        <Text
          style={[s.statValue, { color: fg }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {value}
        </Text>
        <View style={[s.statIcon, { backgroundColor: soft, borderColor: fg }]}>
          <Ionicons name={chip} size={15} color={fg} />
        </View>
      </View>
      <Text style={[s.statLabel, { color: colors.muted }]}>{label.toUpperCase()}</Text>
      <View style={[s.statBar, { backgroundColor: fg }]} />
    </View>
  );
  if (!onPress) return card;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.7 : 1 }]}
    >
      {card}
    </Pressable>
  );
}

export function Empty({ text, icon = "file-tray-outline" }: { text: string; icon?: IoniconName }) {
  const { colors } = useTheme();
  return (
    <View style={s.empty}>
      <View style={[s.emptyIcon, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
        <Ionicons name={icon} color={colors.muted} size={26} />
      </View>
      <Text style={[s.muted, { color: colors.muted }]}>{text}</Text>
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  if (!children) return null;
  return <Text style={[s.error, { color: colors.danger }]}>{children}</Text>;
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={s.empty}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

/** Pulsing placeholder box – keeps a screen's template visible while data loads. */
export function Skeleton({
  width = "100%",
  height = 14,
  radius: r = radius.sm,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const anim = useState(() => new Animated.Value(0.45))[0];
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: r, backgroundColor: colors.skeleton, opacity: anim },
        style,
      ]}
    />
  );
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: space(3) }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={44} />
      ))}
    </View>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card style={{ gap: space(3) }}>
      <Skeleton width="45%" height={16} />
      <SkeletonRows count={lines} />
    </Card>
  );
}

/** Gradient hero banner used at the top of role home screens. */
export function Hero({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <LinearGradient
      colors={[colors.gradientFrom, colors.gradientMid, colors.gradientTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[s.hero, shadow.md]}
    >
      <Text style={s.heroEyebrow}>{eyebrow.toUpperCase()}</Text>
      <Text style={s.heroTitle}>{title}</Text>
      {subtitle ? <Text style={s.heroSubtitle}>{subtitle}</Text> : null}
      {actions}
    </LinearGradient>
  );
}

export function QuickAction({
  label,
  icon,
  onPress,
  tone = "primary",
}: {
  label: string;
  icon: IoniconName;
  onPress: () => void;
  tone?: Tone;
}) {
  const { colors } = useTheme();
  const t =
    tone === "success"
      ? { bg: colors.successSoft, fg: colors.success }
      : tone === "warning"
        ? { bg: colors.warningSoft, fg: colors.warning }
        : tone === "danger"
          ? { bg: colors.dangerSoft, fg: colors.danger }
          : tone === "neutral"
            ? { bg: colors.cardAlt, fg: colors.muted }
            : { bg: colors.primarySoft, fg: colors.primary };
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.quickAction,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && s.quickActionPressed,
      ]}
    >
      <View style={[s.quickActionIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} color={t.fg} size={22} />
      </View>
      <Text style={[s.quickActionLabel, { color: colors.text }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export const statusTone = (status: string): Tone => {
  switch (status) {
    case "PAID":
    case "ACTIVE":
    case "VACANT":
      return "success";
    case "PARTIAL":
    case "MAINTENANCE":
      return "warning";
    case "OVERDUE":
    case "CANCELLED":
    case "LEFT":
    case "INACTIVE":
      return "danger";
    default:
      return "primary";
  }
};

const s = StyleSheet.create({
  screen: { flex: 1, padding: space(4) },
  card: { borderRadius: radius.md, padding: space(4), borderWidth: 1 },
  heading: { fontSize: fonts.header, fontWeight: "700" },
  muted: { fontSize: 14, lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: space(2) },
  rowBetween: { justifyContent: "space-between" },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  sectionTitleBar: { width: 4, height: 16, borderRadius: 2 },
  sectionTitle: { fontWeight: "700", fontSize: 16 },
  button: {
    paddingVertical: space(3),
    paddingHorizontal: space(4),
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  buttonSm: {
    paddingVertical: space(2),
    paddingHorizontal: space(3),
    minHeight: 36,
    alignSelf: "flex-start",
  },
  buttonBlock: { alignSelf: "stretch" },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: space(2) },
  buttonPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  buttonDim: { opacity: 0.5 },
  buttonText: { fontWeight: "700", fontSize: 15 },
  buttonTextSm: { fontSize: 13 },
  badge: {
    paddingHorizontal: space(3),
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  stat: { flex: 1, gap: space(1.5), padding: space(3), borderRadius: radius.md },
  statTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space(2),
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  statValue: { fontSize: 24, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  statBar: { height: 3, borderRadius: 2, marginTop: space(0.5) },
  empty: { padding: space(8), alignItems: "center", justifyContent: "center", gap: space(3) },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  error: { fontSize: 14, marginVertical: space(2) },
  hero: { borderRadius: radius.lg, padding: space(5), gap: space(2) },
  heroEyebrow: {
    color: "rgba(255,255,255,0.75)",
    fontSize: fonts.tiny,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  heroTitle: { color: "#FFFFFF", fontSize: fonts.title, fontWeight: "800", lineHeight: 34 },
  heroSubtitle: { color: "rgba(255,255,255,0.9)", fontSize: fonts.small, lineHeight: 20 },
  quickAction: {
    flex: 1,
    minWidth: 96,
    alignItems: "center",
    gap: space(2),
    paddingVertical: space(3),
    borderRadius: radius.md,
    borderWidth: 1,
    ...shadow.sm,
  },
  quickActionPressed: { transform: [{ scale: 0.95 }] },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: { fontSize: fonts.tiny, fontWeight: "600", textAlign: "center" },
});

/** Single-line data row used across list screens (parallel record layout). */
export function rowCard(bg: string, border: string) {
  return {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: space(3),
    backgroundColor: bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: border,
    padding: space(3),
  };
}