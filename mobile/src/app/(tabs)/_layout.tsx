import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { Platform } from "react-native";
import { TopBar } from "@/components/topbar";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme-context";

export default function TabsLayout() {
  const { user } = useAuth();
  const { colors } = useTheme();
  if (!user) return <Redirect href="/login" />;

  const isWeb = Platform.OS === "web";
  const role = user.role;
  const isOwner = role === "OWNER";
  const showStudents = isOwner;
  const showRooms = role === "OWNER" || role === "STAFF";
  const showFees = role === "OWNER" || role === "STUDENT" || role === "PARENT";
  const showLeaves = role !== "OWNER" && role !== "GUARD";

  return (
    <Tabs
      tabBar={isWeb ? () => null : undefined}
      screenOptions={{
        header: () => <TopBar />,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="students"
        options={{
          title: "Students",
          href: showStudents ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="admissions"
        options={{
          title: "Admissions",
          href: null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="rooms"
        options={{
          title: "Rooms",
          href: showRooms ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="bed-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="fees"
        options={{
          title: "Fees",
          href: showFees ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="cash-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="ad-fees"
        options={{
          title: "Ad-Fees",
          href: null,
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="leaves"
        options={{
          title: "Leaves",
          href: showLeaves ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: "Accounts",
          href: null,
          tabBarIcon: ({ color, size }) => <Ionicons name="id-card-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
