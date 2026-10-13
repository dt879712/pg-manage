import { useState } from "react";
import { Alert, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { EncodingType, File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
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
import { studentFormHtml } from "@/lib/studentForm";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { DocumentFile, StudentDetail, TenantBranding } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function StudentDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, error, reload } = useApi<{ student: StudentDetail }>(`/students/${id}`);
  const { data: tenantData } = useApi<{ tenant: TenantBranding }>("/tenant");
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
  const [formBusy, setFormBusy] = useState(false);

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

  const exportForm = async () => {
    setFormBusy(true);
    setErr(null);
    try {
      const t = tenantData?.tenant;
      const documents = [
        ...(s.documents ?? []).map((d) => ({ title: d.title || d.type, url: d.fileUrl })),
        ...(s.admissionRequest?.documents ?? []).map((d) => ({
          title: d.title || `Form ${d.type}`,
          url: d.fileUrl,
        })),
        ...(s.parents ?? []).flatMap((l) =>
          (l.parent.documents ?? []).map((d) => ({
            title: `${l.parent.name} · ${d.title || d.type}`,
            url: d.fileUrl,
          }))
        ),
      ];
      const html = studentFormHtml({
        pgName: t?.name,
        logoUrl: t?.logoUrl,
        student: {
          firstName: s.firstName,
          lastName: s.lastName,
          gender: s.gender,
          dob: s.dob,
          phone: s.phone,
          email: s.email,
          address: s.address,
          guardianName: s.guardianName,
          guardianPhone: s.guardianPhone,
          guardianEmail: s.guardianEmail,
          roomNumber: s.room?.roomNumber,
          bedLabel: s.bed?.label,
          joinDate: s.joinDate,
          status: s.status,
        },
        admission: s.admissionRequest
          ? {
              course: s.admissionRequest.course,
              college: s.admissionRequest.college,
              note: s.admissionRequest.note,
              submittedAt: s.admissionRequest.createdAt,
            }
          : null,
        parents: (s.parents ?? []).map((l) => ({
          name: l.parent.name,
          relation: l.relation,
          phone: l.parent.phone,
          email: l.parent.email,
          isSuperParent: l.parent.isSuperParent,
        })),
        documents,
        generatedAt: new Date().toLocaleString("en-IN"),
      });

      if (Platform.OS === "web") {
        const w = window.open("", "_blank");
        if (w) {
          w.document.open();
          w.document.write(html);
          w.document.close();
        }
        return;
      }

      const { uri, base64 } = await Print.printToFileAsync({ html, base64: true });
      let pdfUri = uri;
      if (base64) {
        const target = new File(Paths.cache, "student-form.pdf");
        if (target.exists) target.delete();
        target.create();
        target.write(base64, { encoding: EncodingType.Base64 });
        pdfUri = target.uri;
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: "application/pdf",
          dialogTitle: "Save student form",
          UTI: "com.adobe.pdf",
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to build PDF");
    } finally {
      setFormBusy(false);
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
        <Text style={{ fontWeight: "700", color: colors.text }}>Admission form</Text>
        <Muted>Filled form with student &amp; parent documents, exported as PDF.</Muted>
        {(s.parents ?? []).length === 0 ? <Muted>No parents linked</Muted> : null}
        {(s.parents ?? []).map((l) => (
          <Row key={l.id} between>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: colors.text, fontWeight: "600" }}>
                {l.parent.name}
              </Text>
              <Muted numberOfLines={1}>
                {l.relation ?? "Guardian"} · {l.parent.phone ?? "-"}
              </Muted>
            </View>
            <Badge
              label={
                l.parent.isSuperParent === true
                  ? "Super"
                  : l.parent.isSuperParent === false
                    ? "Normal"
                    : "Auto"
              }
              tone={l.parent.isSuperParent === true ? "success" : "neutral"}
            />
          </Row>
        ))}
        <ErrorText>{err}</ErrorText>
        <Button label="Download filled form (PDF)" loading={formBusy} onPress={exportForm} />
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