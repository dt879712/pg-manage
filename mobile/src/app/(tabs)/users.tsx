import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorText,
  Loading,
  Muted,
  Row,
  rowCard,
} from "@/components/ui";
import type { Tone } from "@/components/ui";
import { Avatar } from "@/components/documents";
import { DesktopShell } from "@/components/shell";
import { notify, confirmAction } from "@/lib/dialog";
import { createStaff, deleteUser, resetUserPassword } from "@/lib/endpoints";
import { radius, roleLabels, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { ManagedUser, Role } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const roleTone: Record<Role, Tone> = {
  OWNER: "primary",
  STAFF: "warning",
  GUARD: "warning",
  STUDENT: "neutral",
  PARENT: "success",
};

function UsersView() {
  const { colors } = useTheme();
  const router = useRouter();
  const input = [
    inputStyle,
    { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
  ];
  const { data, loading, error, reload } = useApi<{ users: ManagedUser[] }>("/users");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addRole, setAddRole] = useState<"STAFF" | "GUARD">("STAFF");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetFor, setResetFor] = useState<ManagedUser | null>(null);
  const [resetPw, setResetPw] = useState("");

  const reset = async (u: ManagedUser, newPassword?: string) => {
    setBusy(u.id);
    setErr(null);
    try {
      const r = await resetUserPassword(u.id, newPassword);
      setResetFor(null);
      setResetPw("");
      notify(
        "Password updated",
        r.temporaryPassword
          ? `Temporary password for ${u.name}:\n\n${r.temporaryPassword}\n\nShare it with them and ask them to change it after login.`
          : `New password set for ${u.name}.`
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (u: ManagedUser) => {
    const ok = await confirmAction({
      title: `Delete ${u.name}?`,
      message:
        u.role === "STUDENT"
          ? "Their login will be removed. The student record stays and a new login can be created later."
          : "They will no longer be able to sign in. Records they created stay in the system.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusy(u.id);
    setErr(null);
    try {
      await deleteUser(u.id);
      if (resetFor?.id === u.id) {
        setResetFor(null);
        setResetPw("");
      }
      reload();
      notify("Account deleted", `${u.name} can no longer sign in.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete the account");
    } finally {
      setBusy(null);
    }
  };

  const addStaff = async () => {
    setErr(null);
    try {
      await createStaff({ name: name.trim(), email: email.trim(), password, role: addRole });
      setName("");
      setEmail("");
      setPassword("");
      setShowAdd(false);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  };

  if (loading) return <Loading />;

  const canAdd = name.trim().length > 0 && email.trim().length > 0 && password.length >= 6;

  return (
    <ScrollView
      contentContainerStyle={{
        padding: space(4),
        gap: space(3),
        width: "100%",
        maxWidth: 720,
        alignSelf: "center",
      }}
    >
      <Row between>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Accounts</Text>
        <Button
          label={showAdd ? "Cancel" : "Add account"}
          variant={showAdd ? "ghost" : "primary"}
          icon={showAdd ? "close" : "add"}
          size="sm"
          onPress={() => setShowAdd((v) => !v)}
        />
      </Row>
      <ErrorText>{err || error}</ErrorText>

      {showAdd ? (
        <Card style={{ gap: space(3) }}>
          <Text style={{ fontWeight: "700", color: colors.text }}>New account</Text>
          <Row style={{ gap: space(3) }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Staff"
                variant={addRole === "STAFF" ? "primary" : "ghost"}
                onPress={() => setAddRole("STAFF")}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Guard"
                variant={addRole === "GUARD" ? "primary" : "ghost"}
                onPress={() => setAddRole("GUARD")}
              />
            </View>
          </Row>
          <TextInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={colors.muted} style={input} />
          <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" style={input} />
          <TextInput value={password} onChangeText={setPassword} placeholder="Password (min 6)" placeholderTextColor={colors.muted} secureTextEntry style={input} />
          <Button
            label={addRole === "GUARD" ? "Create guard" : "Create staff"}
            disabled={!canAdd}
            size="sm"
            icon="person-add"
            onPress={addStaff}
          />
        </Card>
      ) : null}

      {resetFor ? (
        <Card style={{ gap: space(3) }}>
          <Row between>
            <Text style={{ fontWeight: "700", color: colors.text }}>
              Set password · {resetFor.name}
            </Text>
            <Button
              label="Cancel"
              variant="ghost"
              size="sm"
              icon="close"
              onPress={() => {
                setResetFor(null);
                setResetPw("");
              }}
            />
          </Row>
          <Muted>
            Type a new password (no old password needed), or generate a temporary one to share.
          </Muted>
          <TextInput
            value={resetPw}
            onChangeText={setResetPw}
            placeholder="New password (min 6)"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            secureTextEntry
            style={input}
          />
          <Row style={{ gap: space(3) }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Set password"
                disabled={resetPw.length < 6}
                size="sm"
                icon="key-outline"
                loading={busy === resetFor.id}
                onPress={() => reset(resetFor, resetPw)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Generate temporary"
                variant="ghost"
                size="sm"
                loading={busy === resetFor.id}
                onPress={() => reset(resetFor)}
              />
            </View>
          </Row>
        </Card>
      ) : null}

      {(data?.users ?? []).length === 0 ? <Empty text="No accounts yet" /> : null}

      {(data?.users ?? []).map((u) => (
        <View
          key={u.id}
          style={[
            rowCard(colors.card, colors.border),
            { flexDirection: "column", alignItems: "stretch", gap: space(2) },
          ]}
        >
          <Row style={{ gap: space(3) }}>
            <Pressable
              onPress={() => router.push({ pathname: "/user/[id]", params: { id: u.id } })}
              style={{ flex: 1, minWidth: 0 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
                <Avatar uri={u.photoUrl} name={u.name} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontWeight: "700", color: colors.text }}>
                    {u.name}
                  </Text>
                  <Muted numberOfLines={1}>
                    {u.email.endsWith("@devhostel.local") ? u.phone ?? u.email : u.email}
                  </Muted>
                </View>
              </View>
            </Pressable>
            <Badge label={roleLabels[u.role] ?? u.role} tone={roleTone[u.role]} />
            {u.isActive ? (
              <Muted>Active</Muted>
            ) : (
              <Text style={{ color: colors.danger, fontSize: 13, fontWeight: "600" }}>Disabled</Text>
            )}
          </Row>
          <Row style={{ gap: space(2), flexWrap: "wrap" }}>
            <Button
              label="Set password"
              variant="ghost"
              size="sm"
              onPress={() => {
                setResetFor(u);
                setResetPw("");
              }}
            />
            {u.role !== "OWNER" ? (
              <Button
                label="Delete"
                variant="ghost"
                size="sm"
                icon="trash-outline"
                loading={busy === u.id}
                onPress={() => remove(u)}
              />
            ) : null}
          </Row>
        </View>
      ))}
    </ScrollView>
  );
}

export default function Users() {
  return (
    <DesktopShell>
      <UsersView />
    </DesktopShell>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderRadius: radius.sm,
  paddingHorizontal: space(3),
  paddingVertical: space(3),
  fontSize: 15,
};
