import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter, type Href } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Logo } from "@/components/logo";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { useAuth } from "@/lib/auth";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

interface NavItem {
  label: string;
  href: Href;
  icon: IoniconName;
  roles: string[];
}

const NAV: NavItem[] = [
  { label: "Home", href: "/", icon: "home-outline", roles: [] },
  { label: "Students", href: "/students", icon: "people-outline", roles: ["OWNER"] },
  { label: "Admissions", href: "/admissions", icon: "document-text-outline", roles: ["OWNER"] },
  { label: "Rooms", href: "/rooms", icon: "bed-outline", roles: ["OWNER", "STAFF"] },
  { label: "Fees", href: "/fees", icon: "cash-outline", roles: ["OWNER", "STUDENT", "PARENT"] },
  { label: "Ad-Fees", href: "/ad-fees", icon: "calendar-outline", roles: ["OWNER", "STUDENT", "PARENT"] },
  { label: "Leaves", href: "/leaves", icon: "calendar-outline", roles: [] },
  {
    label: "Check-in videos",
    href: "/status-videos",
    icon: "videocam-outline",
    roles: ["OWNER", "STAFF", "GUARD", "STUDENT", "PARENT"],
  },
  { label: "Messages", href: "/messages", icon: "chatbubbles-outline", roles: ["OWNER", "STAFF"] },
  { label: "Accounts", href: "/users", icon: "id-card-outline", roles: ["OWNER"] },
  { label: "Profile", href: "/profile", icon: "person-outline", roles: [] },
];

export function DesktopShell({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  if (Platform.OS !== "web") return <>{children}</>;
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.bg }}>
      <Sidebar />
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

function Sidebar() {
  const { colors, isDark, toggle } = useTheme();
  const { user, refresh } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const items = NAV.filter((n) => n.roles.length === 0 || (user && n.roles.includes(user.role)));

  const active = (href: Href) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href as string);

  return (
    <View
      style={{
        width: 224,
        backgroundColor: colors.card,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        paddingVertical: space(4),
        justifyContent: "space-between",
        alignSelf: "stretch",
      }}
    >
      <View style={{ gap: space(2) }}>
        <View style={{ paddingHorizontal: space(4), marginBottom: space(3), gap: space(1) }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
            <Logo size={34} />
            <Text style={{ fontWeight: "800", fontSize: 17, color: colors.text }}>
              Dev Hostel
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "600" }}>
            {user?.name ?? ""}
          </Text>
        </View>
        {items.map((item) => {
          const isActive = active(item.href);
          return (
            <Pressable
              key={String(item.href)}
              onPress={() => router.push(item.href)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space(3),
                paddingHorizontal: space(4),
                paddingVertical: space(2.5),
                marginHorizontal: space(2),
                borderRadius: radius.md,
                backgroundColor: isActive ? colors.primarySoft : "transparent",
              }}
            >
              <Ionicons
                name={item.icon}
                size={19}
                color={isActive ? colors.primary : colors.muted}
              />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: isActive ? "800" : "600",
                  color: isActive ? colors.primary : colors.text,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: space(2) }}>
        <Pressable
          onPress={refresh}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space(3),
            marginHorizontal: space(6),
            paddingVertical: space(2.5),
          }}
        >
          <Ionicons name="refresh-outline" size={18} color={colors.muted} />
          <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 14 }}>
            Refresh
          </Text>
        </Pressable>

        <Pressable
          onPress={toggle}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space(3),
            marginHorizontal: space(6),
            paddingVertical: space(2.5),
          }}
        >
          <Ionicons
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={18}
            color={colors.muted}
          />
          <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 14 }}>
            {isDark ? "Light mode" : "Dark mode"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
