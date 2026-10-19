import { useState } from "react";
import { Alert, Modal, Pressable, Text, TextInput, View } from "react-native";
import { Button, Card, ErrorText, Muted, Row, SectionTitle } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { createPg } from "@/lib/endpoints";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Pg } from "@/lib/types";
import { useApi } from "@/lib/useApi";

// Owner-only strip for choosing which branch (PG) to work in, and for adding
// new branches. Always visible to owners so a single-branch owner has a way to
// add their second one.
const DEFAULT_LIMIT = 4;

export function PgSwitcher() {
  const { colors } = useTheme();
  const { user, switchPg } = useAuth();
  const { data, loading, error, reload } = useApi<{ pgs: Pg[]; limit?: number }>(
    "/tenant/pgs"
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (!user || user.role !== "OWNER") return null;
  const pgs = data?.pgs ?? [];
  const limit = data?.limit ?? DEFAULT_LIMIT;
  const atLimit = pgs.length >= limit;

  const onSwitch = async (pg: Pg) => {
    if (pg.isActive || busyId) return;
    setBusyId(pg.id);
    setErr(null);
    try {
      await switchPg(pg.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not switch branch");
    } finally {
      setBusyId(null);
    }
  };

  if (loading && pgs.length === 0 && !creating) return null;

  return (
    <Card style={{ gap: space(3) }}>
      <SectionTitle>Your branches</SectionTitle>
      <Row style={{ flexWrap: "wrap", gap: space(2) }}>
        {pgs.map((pg) => {
          const active = pg.isActive ?? pg.id === user.tenantId;
          const busy = busyId === pg.id;
          return (
            <Pressable
              key={pg.id}
              disabled={active || !!busyId}
              onPress={() => void onSwitch(pg)}
              style={({ pressed }) => [
                chip,
                {
                  borderColor: active ? colors.primarySolid : colors.border,
                  backgroundColor: active ? colors.primarySolid : colors.bg,
                  opacity: busy ? 0.6 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={{ fontWeight: "700", color: active ? colors.onPrimary : colors.text }}>
                {pg.name}
              </Text>
              {active ? (
                <Text style={{ fontSize: 11, color: colors.onPrimary, opacity: 0.9 }}>Active</Text>
              ) : (
                <Text style={{ fontSize: 11, color: colors.muted }}>
                  {pg._count?.students ?? 0} students
                </Text>
              )}
            </Pressable>
          );
        })}
        {atLimit ? null : (
          <Pressable
            onPress={() => setCreating(true)}
            style={({ pressed }) => [
              chip,
              { borderColor: colors.border, borderStyle: "dashed", opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={{ fontWeight: "700", color: colors.primary }}>+ Add branch</Text>
          </Pressable>
        )}
      </Row>
      <Muted style={{ fontSize: 12 }}>
        Picking a branch shows only that branch&apos;s students, rooms and fees. Settings apply to
        the active branch.{" "}
        {atLimit ? `Maximum of ${limit} branches reached.` : ""}
      </Muted>
      <ErrorText>{error || err}</ErrorText>

      {creating ? (
        <CreatePgModal
          current={pgs.length}
          limit={limit}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      ) : null}
    </Card>
  );
}

function CreatePgModal({
  onClose,
  onCreated,
  current,
  limit,
}: {
  onClose: () => void;
  onCreated: () => void;
  current: number;
  limit: number;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setErr("Enter a name for this branch");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await createPg({ name: name.trim(), city: city.trim() || undefined });
      Alert.alert("Branch created", "You can now switch to it and set it up.");
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create branch");
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space(4), gap: space(4), justifyContent: "center" }}>
        <View style={{ width: "100%", maxWidth: 480, alignSelf: "center", gap: space(3) }}>
          <SectionTitle>New branch</SectionTitle>
          <Muted style={{ fontSize: 12 }}>
            {current} of {limit} branches used. Example names: D1, D2, D3, D4.
          </Muted>
          <Field label="Branch name" value={name} onChangeText={setName} placeholder="e.g. D1" />
          <Field label="City (optional)" value={city} onChangeText={setCity} placeholder="e.g. Pune" />
          <ErrorText>{err}</ErrorText>
          <Row style={{ gap: space(3) }}>
            <Button label="Cancel" variant="ghost" onPress={onClose} />
            <Button label="Create branch" loading={busy} onPress={() => void submit()} />
          </Row>
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Muted>{label}</Muted>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={{
          borderWidth: 1,
          borderRadius: radius.sm,
          paddingHorizontal: space(3),
          paddingVertical: space(3),
          fontSize: 15,
          borderColor: colors.border,
          color: colors.text,
          backgroundColor: colors.bg,
        }}
      />
    </View>
  );
}

const chip = {
  borderWidth: 1,
  borderRadius: radius.sm,
  paddingHorizontal: space(3),
  paddingVertical: space(2),
  alignItems: "center" as const,
  gap: 2,
};
