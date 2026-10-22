import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, ErrorText } from "@/components/ui";
import { Logo } from "@/components/logo";
import { useAuth } from "@/lib/auth";
import { ApiError, setRetryListener } from "@/lib/api";
import { radius, shadow, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

export default function Login() {
  const { colors } = useTheme();
  const router = useRouter();
  const { signIn } = useAuth();
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetAvailable, setResetAvailable] = useState<boolean | null>(null);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isWide = Platform.OS === "web" && width >= 860;

  const scrollRef = useRef<ScrollView>(null);
  const [formY, setFormY] = useState(0);
  const focusForm = () => {
    if (!isWide) scrollRef.current?.scrollTo({ y: Math.max(0, formY - 12), animated: true });
  };

  useEffect(() => {
    setRetryListener((attempt, max) => {
      setNotice(`Waking up the server… retrying (${attempt + 1}/${max}). This can take up to a minute.`);
    });
    return () => setRetryListener(null);
  }, []);

  // Every account (student, parent, staff, owner) has its own unique mobile
  // number, so a phone number resolves to exactly one account — no chooser.
  const submit = async () => {
    setError(null);
    setResetAvailable(null);
    setNotice(null);
    setLoading(true);
    slowTimer.current = setTimeout(() => {
      setNotice("Waking up the server… this can take up to a minute the first time.");
    }, 2500);
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        const canReset = e.data?.canReset === true;
        setResetAvailable(canReset);
        setError(
          canReset
            ? "Incorrect password. You can reset it below."
            : "Incorrect email/mobile or password. Only the owner can reset a password — please contact your owner.",
        );
      } else {
        setError(e instanceof Error ? e.message : "Login failed");
      }
    } finally {
      if (slowTimer.current) clearTimeout(slowTimer.current);
      setNotice(null);
      setLoading(false);
    }
  };

  const gradientPanel = (
    <LinearGradient
      colors={[colors.gradientFrom, colors.gradientMid, colors.gradientTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        flex: isWide ? 1 : 0,
        padding: isWide ? space(8) : space(6),
        gap: space(2),
        alignItems: "flex-start",
        justifyContent: isWide ? "center" : "flex-start",
        paddingTop: isWide ? undefined : space(8),
      }}
    >
      <Logo size={isWide ? 72 : 56} />
      <Text style={{ fontSize: isWide ? 30 : 24, fontWeight: "800", color: "#FFFFFF" }}>Dev Hostel</Text>
      <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: isWide ? 15 : 14, maxWidth: 340 }}>
        Sign in to manage your hostel — students, rooms, fees and attendance in one place.
      </Text>
    </LinearGradient>
  );

  const formPanel = (
    <View
      onLayout={(e) => setFormY(e.nativeEvent.layout.y)}
      style={{
        flex: isWide ? 1 : undefined,
        padding: space(4),
        gap: space(4),
        marginTop: isWide ? 0 : space(4),
        justifyContent: isWide ? "center" : undefined,
      }}
    >
      <Card style={{ gap: space(3), ...shadow.md, maxWidth: isWide ? 400 : undefined, width: isWide ? "100%" : undefined }}>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>Email or mobile number</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            onFocus={focusForm}
            autoCapitalize="none"
            style={[inputStyle, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
            placeholder="you@example.com or 98765 43210"
            placeholderTextColor={colors.muted}
          />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>Password</Text>
          <View>
            <TextInput
              value={password}
              onChangeText={setPassword}
              onFocus={focusForm}
              secureTextEntry={!showPassword}
              style={[inputStyle, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
              placeholder="••••••"
              placeholderTextColor={colors.muted}
            />
            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              style={{ position: "absolute", right: space(3), top: 0, bottom: 0, justifyContent: "center" }}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                color={colors.muted}
                size={20}
              />
            </Pressable>
          </View>
        </View>
        <ErrorText>{error}</ErrorText>
        {notice ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.muted, fontSize: 13, flex: 1 }}>{notice}</Text>
          </View>
        ) : null}
        <Button label="Sign in" onPress={() => submit()} loading={loading} block icon="log-in-outline" />
        {resetAvailable === true ? (
          <Pressable
            onPress={() => router.push("/forgot-password")}
            style={{ alignItems: "center", paddingVertical: space(1) }}
          >
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "600" }}>
              Forgot password? Reset it
            </Text>
          </Pressable>
        ) : resetAvailable === false ? (
          <Text
            style={{ color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: space(1) }}
          >
            Only the PG owner can reset passwords. Please contact your owner.
          </Text>
        ) : null}
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <Pressable
          onPress={() => router.push("/apply")}
          style={{ alignItems: "center", paddingVertical: space(2) }}
        >
          <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "800" }}>
            New student? Apply for admission
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
            Submit your details and documents to the PG owner
          </Text>
        </Pressable>
      </Card>
    </View>
  );

  if (isWide) {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.bg }}>
        {gradientPanel}
        {formPanel}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView ref={scrollRef} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {gradientPanel}
        {formPanel}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderRadius: radius.sm,
  paddingHorizontal: space(3),
  paddingVertical: space(3),
  paddingRight: space(9),
  fontSize: 15,
};