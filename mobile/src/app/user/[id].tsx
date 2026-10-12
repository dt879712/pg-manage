import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Badge, Button, Card, ErrorText, Loading, Muted, Row } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { Avatar, DocumentGallery } from "@/components/documents";
import {
  deleteDocument,
  resetUserPassword,
  updateUser,
  uploadDocument,
} from "@/lib/endpoints";
import { chooseImage } from "@/lib/images";
import { roleLabels, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { DocumentFile, Role, UserDetail } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const roleTone: Record<Role, Tone> = {
  OWNER: "primary",
  STAFF: "warning",
  GUARD: "warning",
  STUDENT: "neutral",
  PARENT: "success",
};

export default function UserDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, reload } = useApi<{ user: UserDetail }>(`/users/${id}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (loading) return <Loading />;
  const u = data?.user;
  if (!u) return <ErrorText>{error || "Not found"}</ErrorText>;

  const setPhoto = async () => {
    const picked = await chooseImage("Profile photo");
    if (!picked) return;
    setBusy(true);
    setErr(null);
    try {
      await updateUser(u.id, { photoUrl: picked.dataUrl });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }}>
      <Card style={{ gap: space(3) }}>
        <Row between>
          <Row>
            <Avatar uri={u.photoUrl} name={u.name} size={56} />
            <View>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>{u.name}</Text>
              <Muted>{u.email}</Muted>
            </View>
          </Row>
          <Badge label={roleLabels[u.role] ?? u.role} tone={roleTone[u.role]} />
        </Row>
        <Row between>
          <Muted>Phone</Muted>
          <Text style={{ color: colors.text, fontWeight: "600" }}>{u.phone ?? "-"}</Text>
        </Row>
        <Row between>
          <Muted>Status</Muted>
          {u.isActive ? <Muted>Active</Muted> : <Text style={{ color: colors.danger }}>Disabled</Text>}
        </Row>
        <Button
          label={u.photoUrl ? "Change photo" : "Add photo"}
          variant="ghost"
          loading={busy}
          onPress={setPhoto}
        />
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={{ fontWeight: "700", color: colors.text }}>Documents</Text>
        <ErrorText>{err}</ErrorText>
        <DocumentGallery
          documents={u.documents ?? []}
          busy={busy}
          onAdd={async () => {
            const picked = await chooseImage("Add document");
            if (!picked) return;
            setBusy(true);
            try {
              await uploadDocument({
                userId: u.id,
                type: "ID_PROOF",
                title: "ID proof",
                dataUrl: picked.dataUrl,
                mimeType: picked.mimeType,
              });
              reload();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Failed");
            } finally {
              setBusy(false);
            }
          }}
          onDelete={async (doc: DocumentFile) => {
            setBusy(true);
            try {
              await deleteDocument(doc.id);
              reload();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Failed");
            } finally {
              setBusy(false);
            }
          }}
        />
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={{ fontWeight: "700", color: colors.text }}>Account</Text>
        <Button
          label="Reset password"
          variant="ghost"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            setErr(null);
            try {
              const r = await resetUserPassword(u.id);
              Alert.alert(
                "Password reset",
                r.temporaryPassword
                  ? `Temporary password:\n\n${r.temporaryPassword}\n\nShare it with them.`
                  : "Password updated."
              );
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Failed");
            } finally {
              setBusy(false);
            }
          }}
        />
      </Card>
    </ScrollView>
  );
}
