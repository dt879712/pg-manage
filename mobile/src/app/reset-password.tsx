import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, ErrorText } from "@/components/ui";
import { Logo } from "@/components/logo";
import { resetPassword } from "@/lib/endpoints";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!token) {
      setError("This link is missing its reset token. Use the full link from the email.");
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset password");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space(3),
    paddingVertical: space(3),
    fontSize: 15,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: space(4) }}>
        <View style={{ alignItems: "center", gap: space(2), marginBottom: space(4) }}>
          <Logo size={64} />
          <Text style={{ fontSize: 24, fontWeight: "800", color: colors.text }}>Choose a new password</Text>
        </View>

        <Card style={{ gap: space(3), maxWidth: 400, width: "100%", alignSelf: "center" }}>
          {done ? (
            <View style={{ gap: space(3) }}>
              <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>
                Your password has been updated. You can now sign in with the new password.
              </Text>
              <Button label="Go to sign in" onPress={() => router.replace("/login")} block icon="log-in-outline" />
            </View>
          ) : (
            <>
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>New password</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  style={[inputStyle, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
                  placeholder="At least 6 characters"
                  placeholderTextColor={colors.muted}
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>Confirm password</Text>
                <TextInput
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  style={[inputStyle, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
                  placeholder="Repeat password"
                  placeholderTextColor={colors.muted}
                />
              </View>
              <ErrorText>{error}</ErrorText>
              <Button label="Reset password" onPress={submit} loading={loading} block icon="key-outline" />
              <Button label="Back to sign in" variant="ghost" onPress={() => router.replace("/login")} />
            </>
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}