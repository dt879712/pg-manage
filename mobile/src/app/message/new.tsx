import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, ErrorText, Muted, Row, SectionTitle } from "@/components/ui";
import { DesktopShell } from "@/components/shell";
import { sendMessage } from "@/lib/endpoints";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

export default function MessageNew() {
  const { colors } = useTheme();
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    if (!body.trim()) {
      setErr("Please write a message");
      return;
    }
    setBusy(true);
    try {
      await sendMessage({ subject: subject.trim() || undefined, body: body.trim() });
      router.replace("/messages");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to send");
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
          <Card style={{ gap: space(2) }}>
            <SectionTitle>Message the owner</SectionTitle>
            <Muted>
              Your message goes to the PG owner and is kept for 48 hours, then deleted
              automatically.
            </Muted>
          </Card>

          <Card style={{ gap: space(3) }}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>Subject (optional)</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="e.g. Fees query"
              placeholderTextColor={colors.muted}
              maxLength={200}
              style={[
                input,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
              ]}
            />
            <Text style={{ color: colors.text, fontWeight: "600" }}>Message</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Write your message..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              maxLength={4000}
              style={[
                input,
                { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg, minHeight: 140 },
              ]}
            />
          </Card>

          <ErrorText>{err}</ErrorText>
          <Row style={{ gap: space(3) }}>
            <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
            <Button label="Send message" loading={busy} onPress={onSubmit} />
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
