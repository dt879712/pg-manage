import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import {
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
import { radius, shadow, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Role } from "@/lib/types";

const DEMO: { role: Role; label: string; email: string; password: string }[] = [
  { role: "STAFF", label: "Staff", email: "staff1@test.com", password: "staff123" },
  { role: "STUDENT", label: "Student", email: "rahul.student@test.com", password: "student123" },
  { role: "PARENT", label: "Parent", email: "parent1@test.com", password: "parent123" },
];

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

  const isWide = Platform.OS === "web" && width >= 860;

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const gradientPanel = (
    <LinearGradient
      colors={[colors.gradientFrom, colors.gradientMid, colors.gradientTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        flex: 1,
        padding: space(8),
        gap: space(2),
        alignItems: isWide ? "flex-start" : "flex-start",
        justifyContent: isWide ? "center" : "flex-start",
        paddingTop: isWide ? undefined : space(16),
      }}
    >
      <Logo size={72} />
      <Text style={{ fontSize: 30, fontWeight: "800", color: "#FFFFFF" }}>Dev Hostel</Text>
      <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, maxWidth: 340 }}>
        Sign in to manage your hostel — students, rooms, fees and attendance in one place.
      </Text>
    </LinearGradient>
  );

  const formPanel = (
    <View
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
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={[inputStyle, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
          />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>Password</Text>
          <View>
            <TextInput
              value={password}
              onChangeText={setPassword}
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
        <Button label="Sign in" onPress={submit} loading={loading} block icon="log-in-outline" />
        <Pressable onPress={() => router.push("/forgot-password")} style={{ alignItems: "center", paddingVertical: space(1) }}>
          <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "600" }}>
            Forgot password?
          </Text>
        </Pressable>
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

      <View style={{ gap: space(3) }}>
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center" }}>
          Quick demo logins
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
          {DEMO.map((d) => (
            <View key={d.role} style={{ flexGrow: 1, flexBasis: 82 }}>
              <Button
                label={d.label}
                variant="ghost"
                onPress={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                }}
              />
            </View>
          ))}
        </View>
      </View>
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
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
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