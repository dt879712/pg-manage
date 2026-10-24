import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Badge, Button, Card, Empty, ErrorText, Loading, Muted, Row } from "@/components/ui";
import { DesktopShell } from "@/components/shell";
import { createAdvanceFee } from "@/lib/endpoints";
import { money, shortDate } from "@/lib/format";
import { radius, space } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme-context";
import type { AdvanceFee, Student, SuperParentSummary } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useRefreshOnFocus } from "@/lib/useRefreshOnFocus";

const methods = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"] as const;
type PaymentMethod = (typeof methods)[number];

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function AdvanceFeesView() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const isOwner = user?.role === "OWNER";
  const { data, loading, error, reload } = useApi<{
    advanceFees: AdvanceFee[];
    superParents: SuperParentSummary[];
    total: number;
  }>("/advance-fees?take=100");
  const { data: studentData, loading: loadingStudents } = useApi<{ students: Student[]; total: number }>(
    isOwner ? "/students?status=ACTIVE&take=100" : null
  );
  useRefreshOnFocus(reload);

  const [showForm, setShowForm] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayString());
  const [paidThrough, setPaidThrough] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    color: colors.text,
    paddingHorizontal: space(3),
    paddingVertical: space(3),
    fontSize: 15,
  } as const;
  const students = studentData?.students ?? [];
  const query = studentSearch.trim().toLowerCase();
  const matches = query
    ? students.filter((item) => `${item.firstName} ${item.lastName ?? ""}`.toLowerCase().includes(query)).slice(0, 8)
    : [];

  const save = async () => {
    const parsedAmount = Number(amount.replace(/\D/g, ""));
    setFormError(null);
    if (!student) return setFormError("Choose a student.");
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) return setFormError("Enter a valid amount.");
    if (!isDate(paidAt)) return setFormError("Enter the payment date as YYYY-MM-DD.");
    if (!isDate(paidThrough)) return setFormError("Enter the paid-through date as YYYY-MM-DD.");
    if (paidThrough < paidAt) return setFormError("Paid-through date must be on or after the payment date.");

    setSaving(true);
    try {
      await createAdvanceFee({
        studentId: student.id,
        amount: parsedAmount,
        method,
        paidAt,
        paidThrough,
        note: note.trim() || undefined,
      });
      reload();
      setShowForm(false);
      setStudent(null);
      setStudentSearch("");
      setAmount("");
      setPaidAt(todayString());
      setPaidThrough("");
      setMethod("CASH");
      setNote("");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save the advance fee.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <Loading />;

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), gap: space(3), width: "100%", maxWidth: 760, alignSelf: "center" }}>
      <Row between style={{ flexWrap: "wrap" }}>
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text }}>Ad-Fees</Text>
          <Muted>Advance payments are recorded separately from regular monthly fees.</Muted>
        </View>
        <Row style={{ gap: space(2), flexWrap: "wrap" }}>
          <Button label="Regular fees" variant="ghost" size="sm" onPress={() => router.push("/(tabs)/fees")} />
          {isOwner ? (
            <Button
              label={showForm ? "Cancel" : "Add Ad-Fee"}
              size="sm"
              onPress={() => {
                setFormError(null);
                setShowForm((current) => !current);
              }}
            />
          ) : null}
        </Row>
      </Row>

      <ErrorText>{error}</ErrorText>

      {isOwner ? (
        <Card style={{ gap: space(2) }}>
          <Text style={{ fontWeight: "800", color: colors.text }}>Super parents</Text>
          <Muted>Parents whose child has a paid future month or an Ad-Fee paid through a future date. Manual overrides are respected.</Muted>
          {(data?.superParents ?? []).length ? (
            <View style={{ gap: space(2) }}>
              {data!.superParents.map((parent) => (
                <View key={parent.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: space(2), flexWrap: "wrap" }}>
                  <Text style={{ color: colors.text, fontWeight: "600" }}>{parent.name}</Text>
                  <Muted>{parent.phone ?? parent.email}</Muted>
                </View>
              ))}
            </View>
          ) : (
            <Muted>No super parents currently.</Muted>
          )}
        </Card>
      ) : null}

      {showForm && isOwner ? (
        <Card style={{ gap: space(3) }}>
          <Text style={{ fontWeight: "800", color: colors.text }}>Record an advance payment</Text>
          {loadingStudents ? <Muted>Loading students…</Muted> : null}
          {student ? (
            <Row between style={{ flexWrap: "wrap" }}>
              <View>
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {student.firstName} {student.lastName ?? ""}
                </Text>
                <Muted>{student.room?.roomNumber ? `Room ${student.room.roomNumber}` : "No room assigned"}</Muted>
              </View>
              <Button label="Change" variant="ghost" size="sm" onPress={() => setStudent(null)} />
            </Row>
          ) : (
            <>
              <TextInput
                value={studentSearch}
                onChangeText={setStudentSearch}
                placeholder="Search active student"
                placeholderTextColor={colors.muted}
                style={inputStyle}
              />
              {matches.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setStudent(item);
                    setStudentSearch("");
                  }}
                  style={{ padding: space(2), borderRadius: radius.sm, backgroundColor: colors.cardAlt }}
                >
                  <Text style={{ color: colors.text, fontWeight: "600" }}>
                    {item.firstName} {item.lastName ?? ""}{item.room?.roomNumber ? ` · Room ${item.room.roomNumber}` : ""}
                  </Text>
                </Pressable>
              ))}
              {!loadingStudents && students.length === 0 ? <Muted>Create a student before recording an Ad-Fee.</Muted> : null}
            </>
          )}
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            placeholder="Amount (₹)"
            placeholderTextColor={colors.muted}
            style={inputStyle}
          />
          <View style={{ gap: space(1) }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>Paid on</Text>
            <TextInput value={paidAt} onChangeText={setPaidAt} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={inputStyle} />
          </View>
          <View style={{ gap: space(1) }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>Paid through</Text>
            <TextInput value={paidThrough} onChangeText={setPaidThrough} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={inputStyle} />
            <Muted>Enter the last date covered by this advance payment.</Muted>
          </View>
          <View style={{ gap: space(1) }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>Payment method</Text>
            <Row style={{ gap: space(2), flexWrap: "wrap" }}>
              {methods.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setMethod(option)}
                  style={{
                    borderWidth: 1,
                    borderColor: method === option ? colors.primary : colors.border,
                    backgroundColor: method === option ? colors.primarySoft : colors.bg,
                    paddingHorizontal: space(3),
                    paddingVertical: space(2),
                    borderRadius: radius.pill,
                  }}
                >
                  <Text style={{ color: method === option ? colors.primary : colors.text, fontWeight: "600" }}>{option.replace("_", " ")}</Text>
                </Pressable>
              ))}
            </Row>
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional)"
            placeholderTextColor={colors.muted}
            style={inputStyle}
          />
          <ErrorText>{formError}</ErrorText>
          <Button label="Save Ad-Fee" loading={saving} onPress={save} />
        </Card>
      ) : null}

      <Row between>
        <Text style={{ fontWeight: "800", fontSize: 16, color: colors.text }}>Advance fee records</Text>
        <Badge label={`${data?.advanceFees.length ?? 0} records`} />
      </Row>
      {(data?.advanceFees ?? []).map((record) => (
        <Card key={record.id} style={{ gap: space(1) }}>
          <Row between style={{ flexWrap: "wrap" }}>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>
              {record.student ? `${record.student.firstName} ${record.student.lastName ?? ""}` : "Student"}
            </Text>
            <Text style={{ color: colors.primary, fontWeight: "800" }}>{money(record.amount)}</Text>
          </Row>
          <Muted>
            {record.student?.room?.roomNumber ? `Room ${record.student.room.roomNumber} · ` : ""}
            Paid {shortDate(record.paidAt)} · {record.method.replace("_", " ")}
          </Muted>
          <Text style={{ color: colors.text, fontWeight: "600" }}>Paid through {shortDate(record.paidThrough)}</Text>
          {record.note ? <Muted>{record.note}</Muted> : null}
          {isOwner && record.student?.parents?.length ? (
            <Muted>
              Parent accounts: {record.student.parents.map((link) => link.parent.name).join(", ")}
            </Muted>
          ) : null}
        </Card>
      ))}
      {!loading && (data?.advanceFees.length ?? 0) === 0 ? <Empty text="No Ad-Fee records yet" /> : null}
    </ScrollView>
  );
}

export default function AdvanceFees() {
  return (
    <DesktopShell>
      <AdvanceFeesView />
    </DesktopShell>
  );
}
