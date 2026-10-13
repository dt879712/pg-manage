import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button, Card, ErrorText, Muted } from "@/components/ui";
import { broadcastNotification } from "@/lib/endpoints";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

const AUDIENCES: { key: string; label: string }[] = [
  { key: "ALL", label: "Everyone" },
  { key: "STUDENTS", label: "Students" },
  { key: "PARENTS", label: "Parents" },
  { key: "SUPER_PARENTS", label: "Super parents" },
  { key: "STAFF", label: "Staff" },
  { key: "OWNERS", label: "Owners" },
];

const PRESETS: { label: string; title: string; body: string }[] = [
  { label: "Good morning", title: "Good morning!", body: "Wishing you a great day ahead. — {PG}" },
  { label: "Good night", title: "Good night", body: "Sleep well and recharge for tomorrow. — {PG}" },
  { label: "Welcome", title: "Welcome!", body: "We're happy to have you with us. Reach out if you need anything." },
  { label: "Festival", title: "Festival wishes", body: "Warm festival wishes to you and your family from all of us." },
];

export default function NotifyScreen() {
  const { colors } = useTheme();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audiences, setAudiences] = useState<string[]>(["ALL"]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (key: string) => {
    setAudiences((prev) => {
      if (key === "ALL") return prev.includes("ALL") ? [] : ["ALL"];
      const rest = prev.filter((k) => k !== "ALL");
      return rest.includes(key) ? rest.filter((k) => k !== key) : [...rest, key];
    });
  };

  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await broadcastNotification({ title: title.trim(), body: body.trim(), audiences });
      setTitle("");
      setBody("");
      Alert.alert("Sent", `Delivered to ${r.recipients} ${r.recipients === 1 ? "person" : "people"}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const canSend = title.trim().length > 0 && body.trim().length > 0 && audiences.length > 0;

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }}>
      <Card style={{ gap: space(3) }}>
        <Text style={{ fontWeight: "700", color: colors.text }}>Quick greetings</Text>
        <View style={styles.chips}>
          {PRESETS.map((p) => (
            <Pressable
              key={p.label}
              onPress={() => {
                setTitle(p.title);
                setBody(p.body.replace("{PG}", ""));
              }}
              style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.bg }]}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={{ fontWeight: "700", color: colors.text }}>Send notification</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColor={colors.muted}
          style={[inputStyle, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
        />
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Message"
          placeholderTextColor={colors.muted}
          multiline
          style={[
            inputStyle,
            { minHeight: 96, textAlignVertical: "top", borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
          ]}
        />
        <Muted>Send to{audiences.length > 1 ? " (multiple)" : ""}</Muted>
        <View style={styles.chips}>
          {AUDIENCES.map((a) => {
            const active = audiences.includes(a.key);
            return (
              <Pressable
                key={a.key}
                onPress={() => toggle(a.key)}
                style={[
                  styles.chip,
                  { borderColor: colors.border, backgroundColor: colors.bg },
                  active && { backgroundColor: colors.primarySolid, borderColor: colors.primarySolid },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? colors.onPrimary : colors.text }]}>
                  {a.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <ErrorText>{err}</ErrorText>
        <Button label="Send notification" disabled={!canSend} loading={busy} onPress={send} />
      </Card>
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

const styles = {
  chips: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: space(2) },
  chip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
  },
  chipText: { fontWeight: "600" as const },
};
