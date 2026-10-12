import { useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Badge, Button, Card, ErrorText, Muted, Row, SectionTitle } from "@/components/ui";
import { DesktopShell } from "@/components/shell";
import { createLeave } from "@/lib/endpoints";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { useAuth } from "@/lib/auth";
import type { LeaveTarget } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const TYPES: { value: string; label: string }[] = [
  { value: "SICK", label: "Sick leave" },
  { value: "PERSONAL", label: "Personal" },
  { value: "HOME", label: "Home visit" },
  { value: "EMERGENCY", label: "Emergency" },
  { value: "OTHER", label: "Other" },
];

export default function LeaveNew() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { data } = useApi<{ targets: LeaveTarget[] }>("/leaves/targets");
  const [type, setType] = useState("SICK");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [studentId, setStudentId] = useState<string | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const targets = data?.targets ?? [];
  const isParent = user?.role === "PARENT";

  const onSubmit = async () => {
    setErr(null);
    if (!fromDate.trim() || !toDate.trim()) {
      setErr("Enter from date and to date (YYYY-MM-DD)");
      return;
    }
    setBusy(true);
    try {
      const body: any = { type, fromDate: fromDate.trim(), toDate: toDate.trim(), reason: reason.trim() || undefined };
      if (studentId) body.studentId = studentId;
      await createLeave(body);
      router.replace("/leaves");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to apply");
      setBusy(false);
    }
  };

  return (
    <DesktopShell>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{
          padding: space(4),
          gap: space(4),
          paddingBottom: space(12),
          alignItems: "center",
        }}
      >
        <View style={{ width: "100%", maxWidth: 560, gap: space(4) }}>
          <Card style={{ gap: space(3) }}>
            <SectionTitle>Leave type</SectionTitle>
            <Row style={{ flexWrap: "wrap", gap: space(2) }}>
              {TYPES.map((t) => (
                <Badge
                  key={t.value}
                  label={t.label}
                  tone={type === t.value ? "primary" : "neutral"}
                />
              ))}
            </Row>
            <Row style={{ flexWrap: "wrap", gap: space(2) }}>
              {TYPES.map((t) => (
                <Button
                  key={t.value}
                  label={t.label}
                  variant={type === t.value ? "primary" : "ghost"}
                  onPress={() => setType(t.value)}
                  size="sm"
                />
              ))}
            </Row>
          </Card>

          {isParent && targets.length > 0 ? (
            <Card style={{ gap: space(3) }}>
              <SectionTitle>Apply for</SectionTitle>
              <Row style={{ flexWrap: "wrap", gap: space(2) }}>
                <Button
                  label="Select child"
                  variant={studentId ? "ghost" : "primary"}
                  size="sm"
                  onPress={() => setStudentId(undefined)}
                />
                {targets.map((t) => (
                  <Button
                    key={t.id}
                    label={t.name}
                    variant={studentId === t.id ? "primary" : "ghost"}
                    size="sm"
                    onPress={() => setStudentId(t.id)}
                  />
                ))}
              </Row>
              {studentId ? <Muted>Applying for selected child</Muted> : null}
            </Card>
          ) : null}

          <Card style={{ gap: space(3) }}>
            <SectionTitle>Dates</SectionTitle>
            <Text style={{ color: colors.text, fontWeight: "600" }}>From date (YYYY-MM-DD)</Text>
            <TextInput
              value={fromDate}
              onChangeText={setFromDate}
              placeholder="2026-10-11"
              placeholderTextColor={colors.muted}
              style={[
                input,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
              ]}
              autoCapitalize="none"
            />
            <Text style={{ color: colors.text, fontWeight: "600" }}>To date (YYYY-MM-DD)</Text>
            <TextInput
              value={toDate}
              onChangeText={setToDate}
              placeholder="2026-10-12"
              placeholderTextColor={colors.muted}
              style={[
                input,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
              ]}
              autoCapitalize="none"
            />
          </Card>

          <Card style={{ gap: space(3) }}>
            <SectionTitle>Reason</SectionTitle>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Optional"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              style={[
                input,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg, minHeight: 96 },
              ]}
            />
          </Card>

          <ErrorText>{err}</ErrorText>
          <Row style={{ gap: space(3) }}>
            <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
            <Button label="Submit request" loading={busy} onPress={onSubmit} />
          </Row>
        </View>
      </ScrollView>
    </DesktopShell>
  );
}

const input = {
  borderWidth: 1,
  borderRadius: radius.sm,
  paddingHorizontal: space(3),
  paddingVertical: space(3),
  fontSize: 15,
};
