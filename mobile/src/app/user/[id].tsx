import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Badge, Button, Card, ErrorText, Loading, Muted, Row } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { Avatar, DocumentGallery } from "@/components/documents";
import { notify } from "@/lib/dialog";
import {
  deleteDocument,
  resetUserPassword,
  updateUser,
  uploadDocument,
} from "@/lib/endpoints";
import { exportPdf, profileFormHtml } from "@/lib/formPdf";
import { chooseImage } from "@/lib/images";
import { radius, roleLabels, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { DocumentFile, Role, TenantBranding, UserDetail } from "@/lib/types";
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
  const { data: tenantData } = useApi<{ tenant: TenantBranding }>("/tenant");
  const [busy, setBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (loading) return <Loading />;
  const u = data?.user;
  if (!u) return <ErrorText>{error || "Not found"}</ErrorText>;

  const exportProfile = async () => {
    setFormBusy(true);
    setErr(null);
    try {
      const t = tenantData?.tenant;
      const html = profileFormHtml({
        pgName: t?.name,
        logoUrl: t?.logoUrl,
        roleLabel: roleLabels[u.role] ?? u.role,
        user: {
          name: u.name,
          email: u.email,
          phone: u.phone,
          photoUrl: u.photoUrl,
          isActive: u.isActive,
          rule:
            u.role === "PARENT"
              ? u.isSuperParent === true
                ? "Super"
                : u.isSuperParent === false
                  ? "Normal"
                  : "Auto"
              : null,
        },
        documents: [
          {
            heading: "Documents",
            items: (u.documents ?? []).map((d) => ({ title: d.title || d.type, url: d.fileUrl })),
          },
        ],
        generatedAt: new Date().toLocaleString("en-IN"),
      });
      await exportPdf(html, `${u.name.replace(/\s+/g, "-").toLowerCase()}-profile.pdf`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to build PDF");
    } finally {
      setFormBusy(false);
    }
  };

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
        <Text style={{ fontWeight: "700", color: colors.text }}>Profile form</Text>
        <Muted>Photo, details and documents as a PDF.</Muted>
        <Button label="Download profile (PDF)" loading={formBusy} onPress={exportProfile} />
      </Card>

      {u.role === "PARENT" ? (
        <Card style={{ gap: space(3) }}>
          <Text style={{ fontWeight: "700", color: colors.text }}>Super parent</Text>
          <Muted>
            Super parents are targeted by the &quot;Super parents&quot; notification. Auto marks
            them super when their child has paid a future month in advance.
          </Muted>
          <Row style={{ gap: space(2) }}>
            {(
              [
                ["Auto", null],
                ["Super", true],
                ["Normal", false],
              ] as const
            ).map(([label, value]) => {
              const active = (u.isSuperParent ?? null) === value;
              return (
                <Pressable
                  key={label}
                  disabled={busy}
                  onPress={async () => {
                    setBusy(true);
                    setErr(null);
                    try {
                      await updateUser(u.id, { isSuperParent: value });
                      reload();
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : "Failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: space(2),
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: active ? colors.primarySolid : colors.border,
                    backgroundColor: active ? colors.primarySolid : colors.bg,
                  }}
                >
                  <Text
                    style={{
                      color: active ? colors.onPrimary : colors.text,
                      fontWeight: "700",
                      fontSize: 13,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </Row>
        </Card>
      ) : null}

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
              notify(
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
