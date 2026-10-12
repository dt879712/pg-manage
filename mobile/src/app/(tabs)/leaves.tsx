import { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
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
  SectionTitle,
  type Tone,
} from "@/components/ui";
import { DesktopShell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { approveLeave, cancelLeave, rejectLeave } from "@/lib/endpoints";
import { shortDate } from "@/lib/format";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Leave } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useRefreshOnFocus } from "@/lib/useRefreshOnFocus";

const TYPE_LABEL: Record<string, string> = {
  SICK: "Sick leave",
  PERSONAL: "Personal",
  HOME: "Home visit",
  EMERGENCY: "Emergency",
  OTHER: "Other",
};

function leaveTone(status: string): Tone {
  if (status === "APPROVED") return "success";
  if (status === "PENDING") return "warning";
  if (status === "REJECTED" || status === "CANCELLED") return "danger";
  return "neutral";
}

function targetName(l: Leave): string {
  if (l.student) return [l.student.firstName, l.student.lastName].filter(Boolean).join(" ");
  return l.applicant?.name ?? "Applicant";
}

function LeavesView() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";
  const [filter, setFilter] = useState<"PENDING" | "ALL">("PENDING");
  const path = isOwner && filter === "PENDING" ? "/leaves?status=PENDING" : "/leaves";
  const { data, loading, error, reload } = useApi<{ leaves: Leave[] }>(path);
  useRefreshOnFocus(reload);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          padding: space(4),
          gap: space(3),
          width: "100%",
          maxWidth: 720,
          alignSelf: "center",
        }}
      >
        {isOwner ? (
          <Row style={{ gap: space(2) }}>
            <Button
              label="Pending"
              variant={filter === "PENDING" ? "primary" : "ghost"}
              onPress={() => setFilter("PENDING")}
            />
            <Button
              label="All"
              variant={filter === "ALL" ? "primary" : "ghost"}
              onPress={() => setFilter("ALL")}
            />
            <Muted style={{ marginLeft: "auto" }}>{data?.leaves.length ?? 0} request(s)</Muted>
          </Row>
        ) : (
          <Row between>
            <Muted>{data?.leaves.length ?? 0} request(s)</Muted>
            <Button label="Apply for leave" icon="add" onPress={() => router.push("/leave/new")} />
          </Row>
        )}
        <ErrorText>{error}</ErrorText>
      </View>

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={data?.leaves ?? []}
          keyExtractor={(l) => l.id}
          refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
          contentContainerStyle={{
            paddingHorizontal: space(4),
            paddingBottom: space(4),
            gap: space(3),
            width: "100%",
            maxWidth: 720,
            alignSelf: "center",
          }}
          ListEmptyComponent={
            <Empty
              text={isOwner ? "No leave requests" : "You haven't applied for leave yet"}
              icon="calendar-outline"
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setOpenId(item.id)}
              style={({ pressed }) => [rowCard(colors.card, colors.border), { opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontWeight: "700", color: colors.text, fontSize: 15 }}>
                  {targetName(item)}
                </Text>
                <Muted numberOfLines={1}>
                  {TYPE_LABEL[item.type] ?? item.type} · {shortDate(item.fromDate)} → {shortDate(item.toDate)}
                </Muted>
                {item.applicant && !item.student ? (
                  <Muted numberOfLines={1} style={{ fontSize: 12 }}>
                    By {item.applicant.name} ({item.applicant.role})
                  </Muted>
                ) : null}
              </View>
              <Badge label={item.status} tone={leaveTone(item.status)} />
            </Pressable>
          )}
        />
      )}

      {openId ? (
        <LeaveDetail
          id={openId}
          isOwner={!!isOwner}
          onClose={() => setOpenId(null)}
          onDone={() => {
            setOpenId(null);
            reload();
          }}
        />
      ) : null}
    </View>
  );
}

function LeaveDetail({
  id,
  isOwner,
  onClose,
  onDone,
}: {
  id: string;
  isOwner: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const { data, loading, error, reload } = useApi<{ leave: Leave }>(`/leaves/${id}`);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "reject" | "cancel">(null);
  const [err, setErr] = useState<string | null>(null);

  const leave = data?.leave;
  const pending = leave?.status === "PENDING";

  const approve = async () => {
    setBusy("approve");
    setErr(null);
    try {
      await approveLeave(id);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to approve");
      setBusy(null);
    }
  };

  const reject = async () => {
    setBusy("reject");
    setErr(null);
    try {
      await rejectLeave(id, reason.trim() || undefined);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to reject");
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    setErr(null);
    try {
      await cancelLeave(id);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to cancel");
      setBusy(null);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{
          padding: space(4),
          gap: space(4),
          paddingBottom: space(12),
          alignItems: "center",
        }}
      >
        <View style={{ width: "100%", maxWidth: 560, gap: space(4) }}>
          {loading ? (
            <Loading />
          ) : error || !leave ? (
            <>
              <ErrorText>{error ?? "Not found"}</ErrorText>
              <Button label="Close" variant="ghost" onPress={onClose} />
            </>
          ) : (
            <>
              <Card style={{ gap: space(2) }}>
                <Row between>
                  <Text style={{ fontWeight: "800", fontSize: 18, color: colors.text }}>
                    {targetName(leave)}
                  </Text>
                  <Badge label={leave.status} tone={leaveTone(leave.status)} />
                </Row>
                <Detail label="Type" value={TYPE_LABEL[leave.type] ?? leave.type} />
                <Detail label="From" value={shortDate(leave.fromDate)} />
                <Detail label="To" value={shortDate(leave.toDate)} />
                {leave.applicant ? (
                  <Detail label="Applied by" value={`${leave.applicant.name} (${leave.applicant.role})`} />
                ) : null}
                {leave.student?.room ? <Detail label="Room" value={leave.student.room.roomNumber} /> : null}
                {leave.reason ? <Detail label="Reason" value={leave.reason} /> : null}
                <Detail label="Submitted" value={shortDate(leave.createdAt)} />
                {leave.rejectionReason ? (
                  <Detail label="Rejection reason" value={leave.rejectionReason} />
                ) : null}
                {leave.reviewedBy ? <Detail label="Reviewed by" value={leave.reviewedBy.name} /> : null}
              </Card>

              {isOwner && pending ? (
                <>
                  <ErrorText>{err}</ErrorText>
                  <Button label="Approve leave" variant="success" loading={busy === "approve"} onPress={approve} />
                  <Card style={{ gap: space(3) }}>
                    <SectionTitle>Reject</SectionTitle>
                    <TextInput
                      value={reason}
                      onChangeText={setReason}
                      placeholder="Reason (optional, shared with applicant)"
                      placeholderTextColor={colors.muted}
                      style={[
                        inputStyle,
                        { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
                      ]}
                    />
                    <Button label="Reject request" variant="danger" loading={busy === "reject"} onPress={reject} />
                  </Card>
                </>
              ) : null}

              {!isOwner && pending ? (
                <>
                  <ErrorText>{err}</ErrorText>
                  <Button label="Cancel request" variant="danger" loading={busy === "cancel"} onPress={cancel} />
                </>
              ) : null}

              <Row style={{ gap: space(3) }}>
                <Button label="Refresh" variant="ghost" onPress={reload} />
                <Button label="Close" variant="ghost" onPress={onClose} />
              </Row>
            </>
          )}
        </View>
      </ScrollView>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: space(2), alignItems: "flex-start" }}>
      <Text style={{ color: colors.muted, fontSize: 13, width: 116 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{value}</Text>
    </View>
  );
}

export default function Leaves() {
  return (
    <DesktopShell>
      <LeavesView />
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
