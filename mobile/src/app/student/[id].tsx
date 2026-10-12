import { useState } from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Badge, Button, Card, ErrorText, Loading, Muted, Row, statusTone } from "@/components/ui";
import { Avatar, DocumentGallery } from "@/components/documents";
import { api } from "@/lib/api";
import {
  createStudentLogin,
  deleteDocument,
  resetUserPassword,
  updateStudent,
  uploadDocument,
} from "@/lib/endpoints";
import { chooseImage } from "@/lib/images";
import { fullName, money, shortDate } from "@/lib/format";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { DocumentFile, StudentDetail } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function StudentDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, error, reload } = useApi<{ student: StudentDetail }>(`/students/${id}`);
  const input = [
    inputStyle,
    { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
  ];
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [docBusy, setDocBusy] = useState(false);

  if (loading) return <Loading />;
  const s = data?.student;
  if (!s) return <ErrorText>{error || "Not found"}</ErrorText>;

  const canDelete = confirm.trim().toLowerCase() === s.firstName.toLowerCase();

  const remove = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/students/${s.id}`, { method: "DELETE" });
      router.back();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  };

  const createLogin = async () => {
    setLoginBusy(true);
    setLoginErr(null);
    try {
      const r = await createStudentLogin({
        studentId: s.id,
        email: loginEmail.trim(),
        password: loginPassword.length >= 6 ? loginPassword : undefined,
      });
      setLoginEmail("");
      setLoginPassword("");
      reload();
      Alert.alert(
        "Login created",
        r.temporaryPassword
          ? `Email: ${r.user.email}\nTemporary password:\n\n${r.temporaryPassword}\n\nShare it with the student.`
          : "Student login created."
      );
    } catch (e) {
      setLoginErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoginBusy(false);
    }
  };

  const resetLogin = async () => {
    if (!s.userId) return;
    setLoginBusy(true);
    setLoginErr(null);
    try {
      const r = await resetUserPassword(s.userId);
      Alert.alert(
        "Password reset",
        r.temporaryPassword ? `Temporary password:\n\n${r.temporaryPassword}` : "Password updated."
      );
    } catch (e) {
      setLoginErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoginBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }}>
      <Card style={{ gap: space(3) }}>
        <Row between>
          <Row>
            <Avatar uri={s.photoUrl} name={fullName(s.firstName, s.lastName)} size={56} />
            <View>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
                {fullName(s.firstName, s.lastName)}
              </Text>
              <Muted>{s.status}</Muted>
            </View>
          </Row>
          <Badge label={s.status} tone={statusTone(s.status)} />
        </Row>
        <Detail label="Room" value={s.room?.roomNumber ? `Room ${s.room.roomNumber}` : "Unassigned"} />
        <Detail label="Bed" value={s.bed?.label ?? "Unassigned"} />
        <Detail label="Phone" value={s.phone ?? "-"} />
        <Detail label="Address" value={s.address ?? "-"} />
        <Detail label="Guardian" value={s.guardianName ?? "-"} />
        <Detail label="Guardian phone" value={s.guardianPhone ?? "-"} />
        <Detail label="Guardian email" value={s.guardianEmail ?? "-"} />
        <Button
          label={s.photoUrl ? "Change photo" : "Add photo"}
          variant="ghost"
          loading={docBusy}
          onPress={async () => {
            const picked = await chooseImage("Student photo");
            if (!picked) return;
            setDocBusy(true);
            try {
              await updateStudent(s.id, { photoUrl: picked.dataUrl });
              reload();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Failed");
            } finally {
              setDocBusy(false);
            }
          }}
        />
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={{ fontWeight: "700", color: colors.text }}>Documents</Text>
        <DocumentGallery
          documents={s.documents ?? []}
          busy={docBusy}
          onAdd={async () => {
            const picked = await chooseImage("Add document");
            if (!picked) return;
            setDocBusy(true);
            try {
              await uploadDocument({
                studentId: s.id,
                type: "ID_PROOF",
                title: "Document",
                dataUrl: picked.dataUrl,
                mimeType: picked.mimeType,
              });
              reload();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Failed");
            } finally {
              setDocBusy(false);
            }
          }}
          onDelete={async (doc: DocumentFile) => {
            setDocBusy(true);
            try {
              await deleteDocument(doc.id);
              reload();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Failed");
            } finally {
              setDocBusy(false);
            }
          }}
        />
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={{ fontWeight: "700", color: colors.text }}>Invoices</Text>
        {(s.invoices ?? []).map((inv) => (
          <Row key={inv.id} between>
            <View>
              <Text style={{ color: colors.text, fontWeight: "600" }}>{inv.title}</Text>
              <Muted>
                {money(inv.amount)} · {shortDate(inv.createdAt)}
              </Muted>
            </View>
            <Badge label={inv.status} tone={statusTone(inv.status)} />
          </Row>
        ))}
        {(s.invoices ?? []).length === 0 ? <Muted>No invoices</Muted> : null}
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={{ fontWeight: "700", color: colors.text }}>Student login</Text>
        {s.userId ? (
          <>
            <Muted>This student has an app login.</Muted>
            <ErrorText>{loginErr}</ErrorText>
            <Button
              label="Reset password"
              variant="ghost"
              loading={loginBusy}
              onPress={resetLogin}
            />
          </>
        ) : (
          <>
            <Muted>Create an app login for this student.</Muted>
            <TextInput
              value={loginEmail}
              onChangeText={setLoginEmail}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={input}
            />
            <TextInput
              value={loginPassword}
              onChangeText={setLoginPassword}
              placeholder="Password (optional)"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={input}
            />
            <ErrorText>{loginErr}</ErrorText>
            <Button
              label="Create login"
              disabled={loginEmail.trim().length === 0}
              loading={loginBusy}
              onPress={createLogin}
            />
          </>
        )}
      </Card>

      <Card style={{ gap: space(3), borderColor: colors.danger }}>
        <Text style={{ fontWeight: "700", color: colors.danger }}>Exit student</Text>
        <Muted>
          This permanently deletes the student and all their records, and frees the bed. Type
          &quot;{s.firstName}&quot; to confirm.
        </Muted>
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          placeholder={s.firstName}
          placeholderTextColor={colors.muted}
          style={input}
          autoCapitalize="none"
        />
        <ErrorText>{err}</ErrorText>
        <Button
          label="Delete permanently"
          variant="danger"
          disabled={!canDelete}
          loading={busy}
          onPress={remove}
        />
      </Card>
    </ScrollView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <Row between>
      <Muted>{label}</Muted>
      <Text style={{ color: colors.text, fontWeight: "600" }}>{value}</Text>
    </Row>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderRadius: radius.sm,
  paddingHorizontal: space(3),
  paddingVertical: space(3),
  fontSize: 15,
};