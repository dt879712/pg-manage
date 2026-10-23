import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  Badge,
  Button,
  Empty,
  ErrorText,
  Loading,
  Muted,
  Row,
  SectionTitle,
  rowCard,
  statusTone,
} from "@/components/ui";
import { DesktopShell } from "@/components/shell";
import { TopBar } from "@/components/topbar";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { addBed, createRoom, deleteBed, deleteRoom, updateBed, updateRoom } from "@/lib/endpoints";
import { money } from "@/lib/format";
import { space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Bed, Property, Room } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const inputStyle = {
  borderWidth: 1,
  borderRadius: 8,
  paddingHorizontal: space(3),
  paddingVertical: space(3),
  fontSize: 15,
};

const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;

function bedStatusLabel(status: string) {
  if (status === "OCCUPIED") return "Occupied";
  if (status === "MAINTENANCE") return "Maintenance";
  return "Available";
}

function RoomsView() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";
  const { data, loading, error, reload } = useApi<{ rooms: Room[] }>("/rooms");
  const { data: propsData } = useApi<{ properties: Property[] }>(
    user?.role === "OWNER" ? "/properties" : null
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);

  const rooms = data?.rooms ?? [];
  const editing = editingId ? rooms.find((r) => r.id === editingId) ?? null : null;
  const managing = managingId ? rooms.find((r) => r.id === managingId) ?? null : null;

  const setStatus = async (room: Room, status: "ACTIVE" | "MAINTENANCE") => {
    setBusy(room.id);
    setErr(null);
    try {
      await api(`/rooms/${room.id}`, { method: "PATCH", body: { status } });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const removeRoom = async (room: Room) => {
    setBusy(room.id);
    setErr(null);
    try {
      await deleteRoom(room.id);
      setDeleting(null);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(3) }}>
        <ErrorText>{err || error}</ErrorText>
        {isOwner ? (
          <Button
            label="+ Add room"
            onPress={() => {
              if (!propsData?.properties?.length) {
                setErr("No property found for this branch. Add a property in settings first.");
                return;
              }
              setErr(null);
              setShowAdd(true);
            }}
          />
        ) : null}
        {rooms.length === 0 ? (
          <Empty text="No rooms yet" />
        ) : (
          rooms.map((room) => {
            const beds = room.beds ?? [];
            const occupied = beds.filter((b) => b.status === "OCCUPIED").length;
            return (
              <View key={room.id} style={rowCard(colors.card, colors.border)}>
                <View style={{ flex: 1, minWidth: 0, gap: space(2) }}>
                  <Row between style={{ alignItems: "center", gap: space(2) }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontWeight: "700", color: colors.text, fontSize: 16, flexShrink: 1 }}
                    >
                      Room {room.roomNumber}
                    </Text>
                    <Badge label={room.status} tone={statusTone(room.status)} />
                  </Row>
                  <Muted numberOfLines={2}>
                    {beds.length} {beds.length === 1 ? "bed" : "beds"} · {occupied} occupied
                    {room.floor != null ? ` · floor ${room.floor}` : ""}
                    {room.gender ? ` · ${room.gender.toLowerCase()}` : ""}
                    {isOwner && room.rentAmount ? ` · ${money(room.rentAmount)}` : ""}
                  </Muted>
                  {beds.length > 0 ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
                      {beds.map((bed) => (
                        <View
                          key={bed.id}
                          style={{
                            borderWidth: 1,
                            borderColor:
                              bed.status === "OCCUPIED"
                                ? colors.primary
                                : bed.status === "MAINTENANCE"
                                  ? colors.warning
                                  : colors.border,
                            backgroundColor:
                              bed.status === "OCCUPIED"
                                ? colors.primarySoft
                                : bed.status === "MAINTENANCE"
                                  ? colors.warningSoft
                                  : colors.bg,
                            borderRadius: 8,
                            paddingHorizontal: space(2),
                            paddingVertical: 4,
                          }}
                        >
                          <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
                            {bed.label}
                          </Text>
                          <Text style={{ color: colors.muted, fontSize: 11 }}>
                            {bed.occupiedBy?.name || bedStatusLabel(bed.status)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Muted style={{ fontSize: 12 }}>No beds yet — open Beds to add them.</Muted>
                  )}

                  {isOwner ? (
                    <Row style={{ flexWrap: "wrap", gap: space(2), marginTop: space(1) }}>
                      <Button
                        label="Edit"
                        variant="ghost"
                        size="sm"
                        icon="create-outline"
                        onPress={() => setEditingId(room.id)}
                      />
                      <Button
                        label={`Beds${beds.length ? ` (${beds.length})` : ""}`}
                        variant="ghost"
                        size="sm"
                        icon="bed-outline"
                        onPress={() => setManagingId(room.id)}
                      />
                      <Button
                        label="Delete"
                        variant="ghost"
                        size="sm"
                        icon="trash-outline"
                        onPress={() => setDeleting(room)}
                      />
                      {room.status === "ACTIVE" ? (
                        <Button
                          label="Maintenance"
                          variant="ghost"
                          size="sm"
                          loading={busy === room.id}
                          onPress={() => setStatus(room, "MAINTENANCE")}
                        />
                      ) : (
                        <Button
                          label="Set active"
                          variant="success"
                          size="sm"
                          loading={busy === room.id}
                          onPress={() => setStatus(room, "ACTIVE")}
                        />
                      )}
                    </Row>
                  ) : room.status === "ACTIVE" ? (
                    <Button
                      label="Maintenance"
                      variant="ghost"
                      size="sm"
                      loading={busy === room.id}
                      onPress={() => setStatus(room, "MAINTENANCE")}
                    />
                  ) : (
                    <Button
                      label="Set active"
                      variant="success"
                      size="sm"
                      loading={busy === room.id}
                      onPress={() => setStatus(room, "ACTIVE")}
                    />
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {showAdd ? (
        <AddRoomModal
          properties={propsData?.properties ?? []}
          onClose={() => setShowAdd(false)}
          onDone={async () => {
            setShowAdd(false);
            await reload();
          }}
        />
      ) : null}

      {editing ? (
        <EditRoomModal
          room={editing}
          onClose={() => setEditingId(null)}
          onDone={async () => {
            setEditingId(null);
            await reload();
          }}
        />
      ) : null}

      {managing ? (
        <BedsModal
          room={managing}
          onClose={() => setManagingId(null)}
          onChanged={reload}
        />
      ) : null}

      {deleting ? (
        <ConfirmModal
          title={`Delete Room ${deleting.roomNumber}?`}
          message="The room and all of its beds will be removed. This cannot be undone."
          confirmLabel="Delete room"
          busy={busy === deleting.id}
          onClose={() => setDeleting(null)}
          onConfirm={() => void removeRoom(deleting)}
        />
      ) : null}
    </>
  );
}

function AddRoomModal({
  properties,
  onClose,
  onDone,
}: {
  properties: Property[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [roomNumber, setRoomNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [rent, setRent] = useState("");
  const [capacity, setCapacity] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const property = properties.find((p) => p.id === propertyId) ?? properties[0];

  const submit = async () => {
    if (!property) {
      setErr("No property found for this branch.");
      return;
    }
    if (!roomNumber.trim()) {
      setErr("Room number is required.");
      return;
    }
    const beds = parseInt(capacity, 10);
    if (!Number.isFinite(beds) || beds < 1) {
      setErr("Enter how many beds this room has.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await createRoom({
        propertyId: property.id,
        roomNumber: roomNumber.trim(),
        floor: floor.trim() ? parseInt(floor, 10) : undefined,
        gender: gender ?? undefined,
        rentAmount: rent.trim() ? Math.max(0, parseInt(rent, 10)) : undefined,
        capacity: beds,
      });
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create room");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar />
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg }}
          contentContainerStyle={{ padding: space(4), gap: space(3) }}
        >
          <Text style={{ fontWeight: "700", fontSize: 18, color: colors.text }}>
            Add room{property ? ` · ${property.name}` : ""}
          </Text>

          {properties.length > 1 ? (
            <View style={{ gap: space(2) }}>
              <Muted>Property</Muted>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
                {properties.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => setPropertyId(p.id)}
                    style={[
                      {
                        paddingHorizontal: space(3),
                        paddingVertical: space(2),
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: propertyId === p.id ? colors.primary : colors.border,
                        backgroundColor: propertyId === p.id ? colors.primarySoft : colors.card,
                      },
                    ]}
                  >
                    <Text style={{ color: propertyId === p.id ? colors.primary : colors.muted }}>
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <Field label="Room number" value={roomNumber} onChangeText={setRoomNumber} placeholder="e.g. 102" />
          <Field label="Floor" value={floor} onChangeText={setFloor} placeholder="e.g. 1" keyboardType="number-pad" />
          <View style={{ gap: space(2) }}>
            <Muted>Gender</Muted>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
              {GENDERS.map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setGender(gender === g ? null : g)}
                  style={[
                    {
                      paddingHorizontal: space(3),
                      paddingVertical: space(2),
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: gender === g ? colors.primary : colors.border,
                      backgroundColor: gender === g ? colors.primarySoft : colors.card,
                    },
                  ]}
                >
                  <Text style={{ color: gender === g ? colors.primary : colors.muted }}>{g}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Field
            label="Default rent / month (₹, optional)"
            value={rent}
            onChangeText={setRent}
            keyboardType="number-pad"
            placeholder="e.g. 7000"
          />
          <Muted style={{ fontSize: 12 }}>
            Used only to prefill a student&apos;s fee. Fees are charged per student.
          </Muted>

          <Field
            label="Capacity (number of beds)"
            value={capacity}
            onChangeText={setCapacity}
            keyboardType="number-pad"
            placeholder="e.g. 5"
          />
          <Muted style={{ fontSize: 12 }}>
            Bed B1…B{capacity.trim() || "n"} are created automatically. You can rename or add beds
            later from the Beds screen.
          </Muted>

          <ErrorText>{err}</ErrorText>
          <Row style={{ gap: space(3) }}>
            <Button label="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
            <Button label="Create room" loading={busy} onPress={() => void submit()} />
          </Row>
        </ScrollView>
      </View>
    </Modal>
  );
}

function EditRoomModal({
  room,
  onClose,
  onDone,
}: {
  room: Room;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const [roomNumber, setRoomNumber] = useState(room.roomNumber);
  const [floor, setFloor] = useState(room.floor != null ? String(room.floor) : "");
  const [gender, setGender] = useState<string | null>(room.gender ?? null);
  const [rent, setRent] = useState(room.rentAmount != null ? String(room.rentAmount) : "");
  const [capacity, setCapacity] = useState(String((room.beds ?? []).length || room.capacity || 1));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const occupied = (room.beds ?? []).filter((b) => b.status === "OCCUPIED").length;

  const submit = async () => {
    if (!roomNumber.trim()) {
      setErr("Room number is required.");
      return;
    }
    const beds = parseInt(capacity, 10);
    if (!Number.isFinite(beds) || beds < 1) {
      setErr("Enter how many beds this room has.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await updateRoom(room.id, {
        roomNumber: roomNumber.trim(),
        floor: floor.trim() ? parseInt(floor, 10) : null,
        gender: gender ?? null,
        rentAmount: rent.trim() ? Math.max(0, parseInt(rent, 10)) : null,
        capacity: beds,
      });
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update room");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar />
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg }}
          contentContainerStyle={{ padding: space(4), gap: space(3) }}
        >
          <Text style={{ fontWeight: "700", fontSize: 18, color: colors.text }}>
            Edit Room {room.roomNumber}
          </Text>
          <Field label="Room number" value={roomNumber} onChangeText={setRoomNumber} placeholder="e.g. 102" />
          <Field label="Floor" value={floor} onChangeText={setFloor} placeholder="e.g. 1" keyboardType="number-pad" />
          <View style={{ gap: space(2) }}>
            <Muted>Gender</Muted>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
              {GENDERS.map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setGender(gender === g ? null : g)}
                  style={[
                    {
                      paddingHorizontal: space(3),
                      paddingVertical: space(2),
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: gender === g ? colors.primary : colors.border,
                      backgroundColor: gender === g ? colors.primarySoft : colors.card,
                    },
                  ]}
                >
                  <Text style={{ color: gender === g ? colors.primary : colors.muted }}>{g}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Field
            label="Capacity (number of beds)"
            value={capacity}
            onChangeText={setCapacity}
            keyboardType="number-pad"
            placeholder="e.g. 5"
          />
          <Field
            label="Default rent / month (₹, optional)"
            value={rent}
            onChangeText={setRent}
            keyboardType="number-pad"
            placeholder="e.g. 7000"
          />
          <Muted style={{ fontSize: 12 }}>
            {occupied} bed(s) occupied. Increasing capacity adds B1…Bn; reducing it removes the
            vacant beds at the end.
          </Muted>
          <ErrorText>{err}</ErrorText>
          <Row style={{ gap: space(3) }}>
            <Button label="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
            <Button label="Save changes" loading={busy} onPress={() => void submit()} />
          </Row>
        </ScrollView>
      </View>
    </Modal>
  );
}

function BedsModal({
  room,
  onClose,
  onChanged,
}: {
  room: Room;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { colors } = useTheme();
  const [newLabel, setNewLabel] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Bed | null>(null);
  const beds = room.beds ?? [];

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    void run("new", async () => {
      await addBed(room.id, label);
      setNewLabel("");
    });
  };

  const rename = (bed: Bed) => {
    const label = (drafts[bed.id] ?? bed.label).trim();
    if (!label || label === bed.label) return;
    void run(bed.id, async () => {
      await updateBed(bed.id, { label });
    });
  };

  const toggleMaintenance = (bed: Bed) => {
    void run(bed.id, () => updateBed(bed.id, { status: bed.status === "MAINTENANCE" ? "VACANT" : "MAINTENANCE" }));
  };

  const remove = (bed: Bed) => {
    void run(bed.id, async () => {
      await deleteBed(bed.id);
      setDeleting(null);
    });
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <TopBar />
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg }}
          contentContainerStyle={{ padding: space(4), gap: space(3) }}
        >
          <Text style={{ fontWeight: "700", fontSize: 18, color: colors.text }}>
            Beds · Room {room.roomNumber}
          </Text>
          <Muted style={{ fontSize: 12 }}>
            Bed labels are exactly what you type. A bed with a student in it cannot be deleted,
            renamed to another bed&apos;s label, or marked available until the student moves out.
          </Muted>

          <Row style={{ gap: space(2), alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}>
              <Field label="New bed label" value={newLabel} onChangeText={setNewLabel} placeholder="e.g. 3" />
            </View>
            <Button label="Add bed" loading={busy === "new"} onPress={add} disabled={!newLabel.trim()} />
          </Row>

          <ErrorText>{err}</ErrorText>
          <Row style={{ gap: space(3) }}>
            <Button label="Done" variant="ghost" onPress={onClose} />
          </Row>

          <SectionTitle>{beds.length} bed(s)</SectionTitle>
          {beds.length === 0 ? <Muted>No beds in this room yet.</Muted> : null}
          {beds.map((bed) => {
            const occupied = bed.status === "OCCUPIED";
            const draft = drafts[bed.id] ?? bed.label;
            return (
              <View key={bed.id} style={rowCard(colors.card, colors.border)}>
                <View style={{ flex: 1, gap: space(2), minWidth: 0 }}>
                  <Row between style={{ alignItems: "center", gap: space(2) }}>
                    <Badge
                      label={bedStatusLabel(bed.status)}
                      tone={occupied ? "primary" : bed.status === "MAINTENANCE" ? "warning" : "success"}
                    />
                    {bed.occupiedBy?.name ? <Muted>{bed.occupiedBy.name}</Muted> : null}
                  </Row>
                  <Row style={{ gap: space(2), alignItems: "flex-end" }}>
                    <View style={{ flex: 1 }}>
                      <Muted style={{ fontSize: 12 }}>Bed label</Muted>
                      <TextInput
                        value={draft}
                        onChangeText={(v) => setDrafts((cur) => ({ ...cur, [bed.id]: v }))}
                        placeholder="e.g. 1"
                        placeholderTextColor={colors.muted}
                        style={[
                          inputStyle,
                          { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
                        ]}
                      />
                    </View>
                    <Button
                      label="Save"
                      size="sm"
                      loading={busy === bed.id}
                      disabled={!draft.trim() || draft.trim() === bed.label}
                      onPress={() => rename(bed)}
                    />
                  </Row>
                  <Row style={{ flexWrap: "wrap", gap: space(2) }}>
                    <Button
                      label={bed.status === "MAINTENANCE" ? "Mark available" : "Maintenance"}
                      variant="ghost"
                      size="sm"
                      disabled={occupied}
                      onPress={() => toggleMaintenance(bed)}
                    />
                    <Button
                      label="Delete bed"
                      variant="ghost"
                      size="sm"
                      icon="trash-outline"
                      disabled={occupied}
                      onPress={() => setDeleting(bed)}
                    />
                  </Row>
                  {occupied ? (
                    <Muted style={{ fontSize: 12 }}>
                      Occupied — move the student out before changing or deleting this bed.
                    </Muted>
                  ) : null}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {deleting ? (
          <ConfirmModal
            title={`Delete bed ${deleting.label}?`}
            message="This bed will be removed from the room."
            confirmLabel="Delete bed"
            busy={busy === deleting.id}
            onClose={() => setDeleting(null)}
            onConfirm={() => remove(deleting)}
          />
        ) : null}
      </View>
    </Modal>
  );
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  busy,
  onClose,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          alignItems: "center",
          justifyContent: "center",
          padding: space(4),
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 420,
            backgroundColor: colors.card,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            padding: space(4),
            gap: space(3),
          }}
        >
          <Text style={{ fontWeight: "700", fontSize: 17, color: colors.text }}>{title}</Text>
          <Muted>{message}</Muted>
          <Row style={{ gap: space(3) }}>
            <Button label="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
            <Button label={confirmLabel} variant="danger" loading={busy} onPress={onConfirm} />
          </Row>
        </View>
      </View>
    </Modal>
  );
}

export default function Rooms() {
  return (
    <DesktopShell>
      <RoomsView />
    </DesktopShell>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad";
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
        keyboardType={keyboardType}
        style={[inputStyle, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]}
      />
    </View>
  );
}
