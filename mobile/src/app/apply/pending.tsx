import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Badge, Button, Card, ErrorText, Heading, Muted, SectionTitle, statusTone } from "@/components/ui";
import { Logo as BrandLogo } from "@/components/logo";
import { getAdmissionStatus } from "@/lib/endpoints";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { AdmissionStatusResult } from "@/lib/types";

export default function ApplyPending() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; phone?: string }>();
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [phone, setPhone] = useState(typeof params.phone === "string" ? params.phone : "");
  const [result, setResult] = useState<AdmissionStatusResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const input = [
    inputStyle,
    { borderColor: colors.border, color: colors.text, backgroundColor: colors.card },
  ];

  const check = useCallback(
    async (mail: string, ph: string) => {
      if (!mail.trim() || !ph.trim()) {
        setErr("Enter the email and phone you applied with.");
        return;
      }
      setBusy(true);
      setErr(null);
      try {
        const res = await getAdmissionStatus(mail.trim().toLowerCase(), ph.trim());
        setResult(res);
      } catch (e) {
        setResult(null);
        setErr(e instanceof Error ? e.message : "Could not find your application");
      } finally {
        setBusy(false);
      }
    },
    []
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (alive && typeof params.email === "string" && typeof params.phone === "string") {
        void check(params.email, params.phone);
      }
    })();
    return () => {
      alive = false;
    };
  }, [params.email, params.phone, check]);

  const submitted = result === null && !!params.email && !!params.phone && !err;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space(4), gap: space(4), alignItems: "center" }}
    >
      <View style={{ width: "100%", maxWidth: 560, gap: space(4) }}>
        <Card style={{ gap: space(3), alignItems: "center" }}>
          <BrandLogo size={56} />
          <Heading>Admission status</Heading>
          <Muted style={{ textAlign: "center" }}>
            {submitted
              ? "Your application was submitted. The owner will review it and allot a room."
              : "Track the status of your admission request below."}
          </Muted>
          {result ? (
            <Badge label={result.status} tone={statusTone(result.status)} />
          ) : null}
        </Card>

        {result ? (
          <Card style={{ gap: space(2) }}>
            <SectionTitle>Hi {result.firstName}</SectionTitle>
            {result.status === "PENDING" ? (
              <Muted>
                Your application is pending. You will be able to sign in once the owner approves
                it and allots you a room.
              </Muted>
            ) : null}
            {result.status === "APPROVED" ? (
              <>
                <Muted>Congratulations — your admission has been approved!</Muted>
                <Muted>
                  Your room:{" "}
                  <Text style={{ fontWeight: "800", color: colors.text }}>
                    {result.roomNumber ? `Room ${result.roomNumber}` : "Allotted"}
                    {result.bedLabel ? ` · ${result.bedLabel}` : ""}
                  </Text>
                </Muted>
                <Button
                  label="Sign in to your account"
                  icon="log-in-outline"
                  onPress={() => router.replace("/login")}
                />
              </>
            ) : null}
            {result.status === "REJECTED" ? (
              <>
                <Muted>
                  We are sorry, your application could not be approved
                  {result.rejectionReason ? `: ${result.rejectionReason}` : "."}
                </Muted>
                <Button
                  label="Apply again"
                  variant="ghost"
                  onPress={() => router.replace("/apply")}
                />
              </>
            ) : null}
          </Card>
        ) : null}

        <View>
          <SectionTitle>Check another application</SectionTitle>
          <Card style={{ gap: space(3), marginTop: space(2) }}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email you applied with"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={input}
            />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone you applied with"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              style={input}
            />
            <ErrorText>{err}</ErrorText>
            <Button label="Check status" loading={busy} onPress={() => check(email, phone)} />
          </Card>
        </View>

        <Button
          label="Back to sign in"
          variant="ghost"
          onPress={() => router.replace("/login")}
        />
      </View>
    </ScrollView>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderRadius: radius.sm,
  paddingHorizontal: space(3),
  paddingVertical: space(3),
  fontSize: 15,
};