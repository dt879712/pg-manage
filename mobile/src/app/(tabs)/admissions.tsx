import { useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
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
  statusTone,
} from "@/components/ui";
import { DesktopShell } from "@/components/shell";
import { TopBar } from "@/components/topbar";
import { approveAdmission, rejectAdmission } from "@/lib/endpoints";
import { fullName, shortDate } from "@/lib/format";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Admission, Pg, Room } from "@/lib/types";
import { useApi } from "@/lib/useApi";

function AdmissionsView() {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<"PENDING" | "ALL">("PENDING");
  const path = filter === "PENDING" ? "/admissions?status=PENDING" : "/admissions";
  const { data, loading, error, reload } = useApi<{ admissions: Admission[] }>(path);
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
          <Muted style={{ marginLeft: "auto" }}>{data?.admissions.length ?? 0} application(s)</Muted>
        </Row>
        <ErrorText>{error}</ErrorText>
      </View>
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={data?.admissions ?? []}
          keyExtractor={(a) => a.id}
          refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
          contentContainerStyle={{
            paddingHorizontal: space(4),
            paddingBottom: space(4),
            gap: space(3),
            width: "100%",
            maxWidth: 720,
            alignSelf: "center",
          }}
          ListEmptyComponent={<Empty text="No admission requests" icon="document-text-outline" />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setOpenId(item.id)}
              style={({ pressed }) => [rowCard(colors.card, colors.border), { opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontWeight: "700", color: colors.text, fontSize: 15 }}>
                  {fullName(item.firstName, item.lastName)}
                </Text>
                <Muted numberOfLines={1}>
                  {item.phone} · {shortDate(item.createdAt)}
                </Muted>
                {item.tenant?.name ? (
                  <Text numberOfLines={1} style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>
                    {item.tenant.name}
                  </Text>
                ) : null}
              </View>
              {item.room?.roomNumber ? (
                <View style={{ minWidth: 96 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13, color: colors.muted }}>
                    Room {item.room.roomNumber}
                  </Text>
                </View>
              ) : null}
              <Badge label={item.status} tone={statusTone(item.status)} />
            </Pressable>
          )}
        />
      )}

      {openId ? (
        <AdmissionDetail
          id={openId}
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

function AdmissionDetail({
  id,
  onClose,
  onDone,
}: {
  id: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const { data, loading, error, reload } = useApi<{ admission: Admission }>(`/admissions/${id}`);
  const { data: pgsData } = useApi<{ pgs: Pg[] }>("/tenant/pgs");
  const [targetPg, setTargetPg] = useState<string | null>(null);
  const { data: roomsData } = useApi<{ rooms: Room[] }>(
    targetPg ? `/rooms?tenantId=${encodeURIComponent(targetPg)}` : "/rooms"
  );
  const [roomId, setRoomId] = useState<string | null>(null);
  const [bedId, setBedId] = useState<string | null>(null);
  const [fee, setFee] = useState("");
  const [paidNow, setPaidNow] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const [err, setErr] = useState<string | null>(null);

  const admission = data?.admission;
  const rooms = roomsData?.rooms ?? [];
  const selectedRoom = rooms.find((r) => r.id === roomId);
  const beds = selectedRoom?.beds ?? [];
  const pgs = pgsData?.pgs ?? [];
  // The PG this application was submitted to; the owner may re-assign it.
  const sourcePgId = admission?.tenantId ?? null;
  const effectivePg = targetPg ?? sourcePgId;

  const approve = async () => {
    setBusy("approve");
    setErr(null);
    try {
      await approveAdmission(id, {
        tenantId: effectivePg ?? undefined,
        roomId: roomId ?? undefined,
        bedId: bedId ?? undefined,
        monthlyFee: fee.trim() ? Math.max(0, parseInt(fee.replace(/\D/g, ""), 10) || 0) : undefined,
        paidForCurrentMonth: paidNow.trim()
          ? Math.max(0, parseInt(paidNow.replace(/\D/g, ""), 10) || 0) > 0
          : false,
        paidAmount: paidNow.trim()
          ? Math.max(0, parseInt(paidNow.replace(/\D/g, ""), 10) || 0)
          : undefined,
      });
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
      await rejectAdmission(id, reason.trim() || undefined);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to reject");
      setBusy(null);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: space(4), gap: space(4), paddingBottom: space(12), alignItems: "center" }}
      >
        <View style={{ width: "100%", maxWidth: 560, gap: space(4) }}>
        {loading ? (
          <Loading />
        ) : error || !admission ? (
          <>
            <ErrorText>{error ?? "Not found"}</ErrorText>
            <Button label="Close" variant="ghost" onPress={onClose} />
          </>
        ) : (
          <>
            <Card style={{ gap: space(2) }}>
              <Row between>
                <Text style={{ fontWeight: "800", fontSize: 18, color: colors.text }}>
                  {fullName(admission.firstName, admission.lastName)}
                </Text>
                <Badge label={admission.status} tone={statusTone(admission.status)} />
              </Row>
              <Detail label="Phone" value={admission.phone} />
              <Detail label="Email" value={admission.email} />
              {admission.gender ? <Detail label="Gender" value={admission.gender} /> : null}
              {admission.course ? <Detail label="Course" value={admission.course} /> : null}
              {admission.college ? <Detail label="College" value={admission.college} /> : null}
              {admission.address ? <Detail label="Address" value={admission.address} /> : null}
              {admission.guardianName ? <Detail label="Guardian" value={admission.guardianName} /> : null}
              {admission.guardianPhone ? <Detail label="Guardian phone" value={admission.guardianPhone} /> : null}
              <Detail label="Submitted" value={shortDate(admission.createdAt)} />
            </Card>

            <Card style={{ gap: space(3) }}>
              <SectionTitle>Documents</SectionTitle>
              {admission.documents && admission.documents.length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(3) }}>
                  {admission.documents.map((d) => (
                    <View key={d.id} style={{ width: 96 }}>
                      <Image
                        source={{ uri: d.fileUrl }}
                        style={{ width: 96, height: 96, borderRadius: radius.sm, backgroundColor: colors.cardAlt }}
                      />
                      <Muted numberOfLines={1} style={{ fontSize: 11, marginTop: 2 }}>
                        {d.title || d.type}
                      </Muted>
                    </View>
                  ))}
                </View>
              ) : (
                <Muted>No documents</Muted>
              )}
            </Card>

            {admission.status === "PENDING" ? (
              <>
                <Card style={{ gap: space(3) }}>
                  <SectionTitle>Allot a room</SectionTitle>
                  {pgs.length > 1 ? (
                    <View style={{ gap: space(2) }}>
                      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                        ADMISSION INTO (BRANCH)
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
                        {pgs.map((pg) => {
                          const sel = effectivePg === pg.id;
                          return (
                            <Pressable
                              key={pg.id}
                              onPress={() => {
                                setTargetPg(pg.id);
                                setRoomId(null);
                                setBedId(null);
                              }}
                              style={[
                                chipStyle,
                                { borderColor: colors.border, backgroundColor: colors.bg },
                                sel && { backgroundColor: colors.primarySolid, borderColor: colors.primarySolid },
                              ]}
                            >
                              <Text style={{ color: sel ? colors.onPrimary : colors.text, fontWeight: "600" }}>
                                {pg.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
                    {rooms.map((r) => (
                      <Pressable
                        key={r.id}
                        onPress={() => {
                          setRoomId(r.id);
                          setBedId(null);
                          if (!fee.trim() && r.rentAmount != null) setFee(String(r.rentAmount));
                        }}
                        style={[
                          chipStyle,
                          { borderColor: colors.border, backgroundColor: colors.bg },
                          roomId === r.id && { backgroundColor: colors.primarySolid, borderColor: colors.primarySolid },
                        ]}
                      >
                        <Text style={{ color: roomId === r.id ? colors.onPrimary : colors.text, fontWeight: "600" }}>
                          Room {r.roomNumber}
                        </Text>
                      </Pressable>
                    ))}
                    {rooms.length === 0 ? <Muted>No rooms yet — create a room first</Muted> : null}
                  </View>
                  {selectedRoom ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
                      {beds.map((b) => {
                        const disabled = b.status === "OCCUPIED";
                        return (
                          <Pressable
                            key={b.id}
                            disabled={disabled}
                            onPress={() => setBedId((cur) => (cur === b.id ? null : b.id))}
                            style={[
                              chipStyle,
                              { borderColor: colors.border, backgroundColor: colors.bg },
                              bedId === b.id && { backgroundColor: colors.primarySolid, borderColor: colors.primarySolid },
                              disabled && { opacity: 0.4 },
                            ]}
                          >
                            <Text style={{ color: bedId === b.id ? colors.onPrimary : colors.text, fontWeight: "600" }}>
                              {b.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                      {beds.length === 0 ? <Muted>No beds in this room (can still allot the room)</Muted> : null}
                    </View>
                  ) : null}
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
                      MONTHLY FEE (₹)
                    </Text>
                    <TextInput
                      value={fee}
                      onChangeText={setFee}
                      placeholder="e.g. 7000"
                      placeholderTextColor={colors.muted}
                      keyboardType="number-pad"
                      style={[
                        inputStyle,
                        { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
                      ]}
                    />
                    <Muted style={{ fontSize: 12 }}>Charged per student. Picking a room prefills its rent.</Muted>
                    <View style={{ gap: 4 }}>
                      <Text style={{ color: colors.text, fontWeight: "600", fontSize: 13 }}>
                        Paid now (₹)
                      </Text>
                      <TextInput
                        value={paidNow}
                        onChangeText={setPaidNow}
                        placeholder="Leave blank if nothing paid yet"
                        placeholderTextColor={colors.muted}
                        keyboardType="number-pad"
                        editable={fee.trim().length > 0}
                        style={[
                          inputStyle,
                          { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
                          fee.trim().length === 0 && { opacity: 0.5 },
                        ]}
                      />
                      <Muted style={{ fontSize: 12 }}>
                        First month&apos;s fee is added to the due list automatically. Part payments keep
                        the remaining balance due.
                      </Muted>
                    </View>
                  </View>
                  <Muted style={{ fontSize: 12 }}>
                    Room only = allot whole room; pick a bed for shared rooms. Student gets notified on approval.
                  </Muted>
                </Card>

                <ErrorText>{err}</ErrorText>
                <Button label="Approve & activate student" loading={busy === "approve"} onPress={approve} />

                <Card style={{ gap: space(3) }}>
                  <SectionTitle>Reject</SectionTitle>
                  <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Reason (optional, shared with the student)"
                    placeholderTextColor={colors.muted}
                    style={[
                      inputStyle,
                      { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
                    ]}
                  />
                  <Button label="Reject application" variant="danger" loading={busy === "reject"} onPress={reject} />
                </Card>
              </>
            ) : (
              <Card style={{ gap: space(2) }}>
                <SectionTitle>Decision</SectionTitle>
                <Detail
                  label="Room"
                  value={admission.room?.roomNumber ? `Room ${admission.room.roomNumber}` : "—"}
                />
                {admission.bed?.label ? <Detail label="Bed" value={admission.bed.label} /> : null}
                {admission.rejectionReason ? (
                  <Detail label="Reason" value={admission.rejectionReason} />
                ) : null}
              </Card>
            )}

            <Row style={{ gap: space(3) }}>
              <Button label="Refresh" variant="ghost" onPress={reload} />
              <Button label="Close" variant="ghost" onPress={onClose} />
            </Row>
          </>
        )}
        </View>
      </ScrollView>
      </View>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: space(2), alignItems: "flex-start" }}>
      <Text style={{ color: colors.muted, fontSize: 13, width: 108 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{value}</Text>
    </View>
  );
}

export default function Admissions() {
  return (
    <DesktopShell>
      <AdmissionsView />
    </DesktopShell>
  );
}

const chipStyle = {
  borderWidth: 1,
  borderRadius: radius.sm,
  paddingHorizontal: space(3),
  paddingVertical: space(2),
};

const inputStyle = {
  borderWidth: 1,
  borderRadius: radius.sm,
  paddingHorizontal: space(3),
  paddingVertical: space(3),
  fontSize: 15,
};