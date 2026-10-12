import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TopBar } from "@/components/topbar";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider, useTheme } from "@/lib/theme-context";

function AppStack() {
  const { isDark, colors } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="apply/index" options={{ headerShown: true, header: () => <TopBar /> }} />
        <Stack.Screen name="apply/pending" options={{ headerShown: true, header: () => <TopBar /> }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="student/new" options={{ headerShown: true, header: () => <TopBar /> }} />
        <Stack.Screen name="student/[id]" options={{ headerShown: true, header: () => <TopBar /> }} />
        <Stack.Screen name="user/[id]" options={{ headerShown: true, header: () => <TopBar /> }} />
        <Stack.Screen name="settings" options={{ headerShown: true, header: () => <TopBar /> }} />
        <Stack.Screen name="notify" options={{ headerShown: true, header: () => <TopBar /> }} />
        <Stack.Screen name="leave/new" options={{ headerShown: true, header: () => <TopBar /> }} />
        <Stack.Screen name="messages" options={{ headerShown: true, header: () => <TopBar /> }} />
        <Stack.Screen name="message/new" options={{ headerShown: true, header: () => <TopBar /> }} />
        <Stack.Screen name="status-videos" options={{ headerShown: true, header: () => <TopBar /> }} />
        <Stack.Screen name="status-video/record" options={{ headerShown: true, header: () => <TopBar /> }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppStack />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}