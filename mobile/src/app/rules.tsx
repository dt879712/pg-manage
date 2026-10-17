import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { Button, Card, ErrorText, Loading, Muted } from "@/components/ui";
import { updateTenant } from "@/lib/endpoints";
import { useAuth } from "@/lib/auth";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { TenantBranding } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function RulesScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";
  const { data, loading, error, reload } = useApi<{ tenant: TenantBranding }>("/tenant");
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (loading) return <Loading />;
  const t = data?.tenant;
  if (!t) return <ErrorText>{error || "Not found"}</ErrorText>;

  const rules = (draft ?? t.rules ?? "").toString();
  const hasRules = rules.trim().length > 0;

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await updateTenant({ rules: rules.trim() });
      setDraft(null);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save rules");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        padding: space(4),
        gap: space(4),
        width: "100%",
        maxWidth: 760,
        alignSelf: "center",
      }}
    >
      <View style={{ gap: space(1) }}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: colors.text }}>
          Rules &amp; regulations
        </Text>
        <Muted>{t.name}</Muted>
      </View>

      {isOwner ? (
        <Card style={{ gap: space(3) }}>
          <Muted>
            Write the house rules and regulations. Everyone in your PG can read them; only you can
            edit them.
          </Muted>
          <TextInput
            value={rules}
            onChangeText={setDraft}
            multiline
            textAlignVertical="top"
            placeholder={"1. ...\n2. ..."}
            placeholderTextColor={colors.muted}
            style={{
              minHeight: 220,
              borderWidth: 1,
              borderRadius: radius.sm,
              paddingHorizontal: space(3),
              paddingVertical: space(3),
              fontSize: 15,
              lineHeight: 22,
              borderColor: colors.border,
              color: colors.text,
              backgroundColor: colors.bg,
            }}
          />
          <ErrorText>{err}</ErrorText>
          <Button
            label="Save rules"
            icon="checkmark"
            onPress={save}
            loading={busy}
            disabled={draft === null}
          />
        </Card>
      ) : (
        <Card style={{ gap: space(3) }}>
          {hasRules ? (
            <Text style={{ fontSize: 15, lineHeight: 24, color: colors.text }}>{rules}</Text>
          ) : (
            <Muted>No rules have been set yet.</Muted>
          )}
        </Card>
      )}
    </ScrollView>
  );
}
