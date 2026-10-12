export const lightColors = {
  bg: "#F4F6FB",
  card: "#FFFFFF",
  cardAlt: "#F8FAFC",
  text: "#0F172A",
  muted: "#64748B",
  border: "#E6EAF2",
  primary: "#2563EB",
  primarySolid: "#1D4ED8",
  primarySoft: "#DBEAFE",
  primaryLight: "#EFF6FF",
  success: "#16A34A",
  successSolid: "#16A34A",
  successSoft: "#DCFCE7",
  warning: "#D97706",
  warningSoft: "#FEF3C7",
  danger: "#DC2626",
  dangerSolid: "#DC2626",
  dangerSoft: "#FEE2E2",
  onPrimary: "#FFFFFF",
  skeleton: "#E2E8F0",
  gradientFrom: "#2563EB",
  gradientMid: "#4F46E5",
  gradientTo: "#7C3AED",
};

export const darkColors = {
  bg: "#0A0E18",
  card: "#141B2C",
  cardAlt: "#1C2538",
  text: "#F2F5FB",
  muted: "#9BA7BE",
  border: "#252E44",
  primary: "#4C8DFF",
  primarySolid: "#2F6BEB",
  primarySoft: "#1A2A50",
  primaryLight: "#121E3C",
  success: "#3BD98B",
  successSolid: "#1B7F43",
  successSoft: "#0F2E22",
  warning: "#F5B942",
  warningSoft: "#312408",
  danger: "#FF7B7B",
  dangerSolid: "#C62F34",
  dangerSoft: "#3B1A21",
  onPrimary: "#FFFFFF",
  skeleton: "#1F2942",
  gradientFrom: "#1D4ED8",
  gradientMid: "#4338CA",
  gradientTo: "#6D28D9",
};

export type ThemeColors = typeof lightColors;

/** Backwards-compatible alias used only by helper modules that aren't components. */
export const colors = lightColors;

export const space = (n: number) => n * 4;

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };

export const fonts = {
  title: 26,
  header: 20,
  body: 15,
  small: 13,
  tiny: 11,
  bold: "700" as const,
  heavy: "800" as const,
};

/** Soft elevation presets – spread into a style object. */
export const shadow = {
  none: {},
  sm: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
};

export const roleLabels: Record<string, string> = {
  OWNER: "Owner",
  STAFF: "Staff",
  GUARD: "Guard",
  STUDENT: "Student",
  PARENT: "Parent",
};