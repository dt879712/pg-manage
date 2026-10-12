import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, ErrorText, Muted } from "@/components/ui";
import { Logo } from "@/components/logo";
import { forgotPassword } from "@/lib/endpoints";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await forgotPassword(email.trim());
      setDone(true);
      setDevLink(res.devLink ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send reset request");
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
          <Text style={{ fontSize: 24, fontWeight: "800", color: colors.text }}>Reset password</Text>
          <Muted>For the hostel owner account</Muted>
        </View>

        <Card style={{ gap: space(3), maxWidth: 400, width: "100%", alignSelf: "center" }}>
          {done ? (
            <View style={{ gap: space(3) }}>
              <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>
                If an owner account exists for{" "}
                <Text style={{ fontWeight: "700", color: colors.text }}>{email.trim()}</Text>, a
                password-reset link has been sent to that email. It expires in 30 minutes.
              </Text>
              {devLink ? (
                <View
                  style={{
                    backgroundColor: colors.cardAlt,
                    borderRadius: radius.sm,
                    padding: space(3),
                    gap: space(2),
                  }}
                >
                  <Text style={{ color: colors.warning, fontSize: 13, fontWeight: "700" }}>
                    Email not configured (dev mode)
                  </Text>
                  <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>{devLink}</Text>
                  <Muted>Open this link in the browser to choose a new password.</Muted>
                </View>
              ) : null}
              <Button label="Back to sign in" variant="ghost" onPress={() => router.replace("/login")} />
            </View>
          ) : (
            <>
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>Owner email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoFocus
                  style={[inputStyle, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
                  placeholder="owner@example.com"
                  placeholderTextColor={colors.muted}
                />
              </View>
              <ErrorText>{error}</ErrorText>
              <Button label="Send reset link" onPress={submit} loading={loading} block icon="mail-outline" />
              <Button label="Back to sign in" variant="ghost" onPress={() => router.replace("/login")} />
            </>
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}