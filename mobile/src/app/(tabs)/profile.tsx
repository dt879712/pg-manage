import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, ErrorText, Muted, Row } from "@/components/ui";
import { DesktopShell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { updateUser } from "@/lib/endpoints";
import { disableWebPush, enableWebPush, getWebPushEnabled } from "@/lib/push";
import { radius, roleLabels, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

function ProfileView() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, signOut, setUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(user?.email ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webPushEnabled, setWebPushEnabled] = useState(false);
  const [webPushLoading, setWebPushLoading] = useState(false);
  const [webPushMessage, setWebPushMessage] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS === "web") void getWebPushEnabled().then(setWebPushEnabled).catch(() => {});
  }, []);
  if (!user) return null;

  const save = async () => {
    const next = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) {
      setError("Enter a valid email address");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const r = await updateUser(user.id, { email: next });
      setUser({ ...user, email: r.user.email });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update email");
    } finally {
      setLoading(false);
    }
  };

  const changeWebPush = async () => {
    setWebPushLoading(true);
    setWebPushMessage(null);
    try {
      if (webPushEnabled) {
        await disableWebPush();
        setWebPushEnabled(false);
        setWebPushMessage("Browser notifications are turned off.");
      } else {
        await enableWebPush();
        setWebPushEnabled(true);
        setWebPushMessage("Notifications are enabled on this device.");
      }
    } catch (e) {
      setWebPushMessage(e instanceof Error ? e.message : "Could not update notification settings.");
    } finally {
      setWebPushLoading(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        padding: space(4),
        gap: space(4),
        width: "100%",
        maxWidth: 560,
        alignSelf: "center",
      }}
    >
      <Card style={{ gap: space(3), alignItems: "center" }}>
        <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {user.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>{user.name}</Text>
        <Text style={{ color: colors.muted }}>{roleLabels[user.role] ?? user.role}</Text>
      </Card>

      {Platform.OS === "web" ? (
        <Card style={{ gap: space(3) }}>
          <Text style={{ fontWeight: "700", color: colors.text }}>Browser notifications</Text>
          <Muted>
            Get alerts for new announcements and other app notifications on this device.
          </Muted>
          {webPushMessage ? <Muted>{webPushMessage}</Muted> : null}
          <Button
            label={webPushEnabled ? "Turn off notifications" : "Enable notifications"}
            variant={webPushEnabled ? "ghost" : "primary"}
            size="sm"
            icon={webPushEnabled ? "notifications-off-outline" : "notifications-outline"}
            onPress={changeWebPush}
            loading={webPushLoading}
          />
        </Card>
      ) : null}

      <Card style={{ gap: space(3) }}>
        {editing ? (
          <>
            <Text style={{ fontWeight: "700", color: colors.text }}>Change email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoFocus
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
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
            />
            <ErrorText>{error}</ErrorText>
            <Row style={{ gap: space(2) }}>
              <Button label="Save" icon="checkmark" onPress={save} loading={loading} size="sm" />
              <Button
                label="Cancel"
                variant="ghost"
                icon="close"
                size="sm"
                onPress={() => {
                  setEmail(user.email);
                  setError(null);
                  setEditing(false);
                }}
              />
            </Row>
          </>
        ) : (
          <>
            <View style={{ gap: space(2) }}>
              <Detail label="Email" value={user.email} />
              {user.phone ? <Detail label="Phone" value={user.phone} /> : null}
            </View>
            <Button
              label="Change email"
              variant="ghost"
              size="sm"
              icon="mail-outline"
              onPress={() => setEditing(true)}
            />
          </>
        )}
      </Card>

      {user.role === "OWNER" ? (
        <Card style={{ gap: space(3) }}>
          <Text style={{ fontWeight: "700", color: colors.text }}>Manage your PG</Text>
          <Button
            label="PG profile & branding"
            variant="ghost"
            size="sm"
            icon="business-outline"
            onPress={() => router.push("/settings")}
          />
          <Button
            label="Send notification"
            variant="ghost"
            size="sm"
            icon="notifications-outline"
            onPress={() => router.push("/notify")}
          />
        </Card>
      ) : null}

      <Button
        label="Rules & regulations"
        variant="ghost"
        size="sm"
        icon="document-text-outline"
        onPress={() => router.push("/rules")}
      />

      <Button
        label="Privacy policy"
        variant="ghost"
        size="sm"
        icon="shield-checkmark-outline"
        onPress={() => router.push("/privacy")}
      />

      <Button label="Sign out" variant="danger" size="sm" icon="log-out-outline" onPress={signOut} />
    </ScrollView>
  );
}

export default function Profile() {
  return (
    <DesktopShell>
      <ProfileView />
    </DesktopShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Muted>{label}</Muted>
      <Text style={{ color: colors.text, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 26, fontWeight: "800" },
});
