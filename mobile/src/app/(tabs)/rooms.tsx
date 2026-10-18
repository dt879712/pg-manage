import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Badge, Button, Empty, ErrorText, Loading, Muted, Row, rowCard, statusTone } from "@/components/ui";
import { DesktopShell } from "@/components/shell";
import { TopBar } from "@/components/topbar";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { addBed, createRoom, deleteRoom } from "@/lib/endpoints";
import { money } from "@/lib/format";
import { space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Property, Room } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const inputStyle = {
  borderWidth: 1,
  borderRadius: 8,
  paddingHorizontal: space(3),
  paddingVertical: space(3),
  fontSize: 15,
};

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

  const onLongPress = (room: Room) => {
    if (!isOwner) return;
    Alert.alert(
      `Room ${room.roomNumber}`,
      undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Add bed",
          onPress: () => {
            Alert.prompt?.("Add bed", "Bed label (e.g. B3)", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Add",
                onPress: async (label?: string) => {
                  if (!label?.trim()) return;
                  setBusy(room.id);
                  try {
                    await addBed(room.id, label.trim());
                    reload();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Failed");
                  } finally {
                    setBusy(null);
                  }
                },
              },
            ]);
          },
        },
        {
          text: "Delete room",
          style: "destructive",
          onPress: () =>
            Alert.alert("Delete room", `Delete Room ${room.roomNumber}? This cannot be undone.`, [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                  setBusy(room.id);
                  try {
                    await deleteRoom(room.id);
                    reload();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Failed");
                  } finally {
                    setBusy(null);
                  }
                },
              },
            ]),
        },
      ]
    );
  };

  if (loading) return <Loading />;

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(3) }}>
        <ErrorText>{err || error}</ErrorText>
        {isOwner ? (
          <Button
            label="+ Add room"
            loading={busy === "add"}
            onPress={() => {
              if (!propsData?.properties?.length) {
                Alert.alert("No property", "Create a property first in the owner setup screen.");
                return;
              }
              setErr(null);
              setShowAdd(true);
            }}
          />
        ) : null}
        {!data || data.rooms.length === 0 ? (
          <Empty text="No rooms yet" />
        ) : (
          data.rooms.map((room) => {
            const beds = room.beds ?? [];
            const occupied = beds.filter((b) => b.status === "OCCUPIED").length;
            return (
              <Pressable key={room.id} onLongPress={() => onLongPress(room)}>
                <View style={rowCard(colors.card, colors.border)}>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text numberOfLines={1} style={{ fontWeight: "700", color: colors.text, fontSize: 15 }}>
                      Room {room.roomNumber}
                    </Text>
                    <Muted numberOfLines={1}>
                      {occupied}/{beds.length} beds · capacity {room.capacity}
                      {isOwner && room.rentAmount ? ` · ${money(room.rentAmount)}` : ""}
                    </Muted>
                    {beds.length > 0 ? (
                      <Text numberOfLines={1} style={{ fontSize: 12, color: colors.muted }}>
                        {beds.map((b) => `${b.label}${b.status === "OCCUPIED" ? "●" : ""}`).join("  ")}
                      </Text>
                    ) : null}
                  </View>
                  <Badge label={room.status} tone={statusTone(room.status)} />
                  {room.status === "ACTIVE" ? (
                    <Button
                      label="Maintenance"
                      variant="ghost"
                      loading={busy === room.id}
                      onPress={() => setStatus(room, "MAINTENANCE")}
                    />
                  ) : (
                    <Button
                      label="Set active"
                      variant="success"
                      loading={busy === room.id}
                      onPress={() => setStatus(room, "ACTIVE")}
                    />
                  )}
                </View>
              </Pressable>
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
            reload();
          }}
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
  const [roomNumber, setRoomNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [capacity, setCapacity] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [rent, setRent] = useState("");
  const [beds, setBeds] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!roomNumber.trim()) {
      setErr("Room number is required.");
      return;
    }
    const cap = capacity ? Math.max(1, parseInt(capacity, 10)) : undefined;
    setBusy(true);
    setErr(null);
    try {
      await createRoom({
        propertyId: properties[0].id,
        roomNumber: roomNumber.trim(),
        floor: floor ? parseInt(floor, 10) : undefined,
        capacity: cap,
        gender: gender ?? undefined,
        rentAmount: rent ? Math.max(0, parseInt(rent, 10)) : undefined,
        bedCount: beds && cap ? cap : undefined,
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
          Add room{properties[0] ? ` · ${properties[0].name}` : ""}
        </Text>
        <Field label="Room number" value={roomNumber} onChangeText={setRoomNumber} placeholder="e.g. 102" />
        <Field label="Floor" value={floor} onChangeText={setFloor} placeholder="e.g. 1" keyboardType="number-pad" />
        <Field
          label="Capacity"
          value={capacity}
          onChangeText={setCapacity}
          placeholder="e.g. 2"
          keyboardType="number-pad"
        />
        <View style={{ gap: space(2) }}>
          <Muted>Gender</Muted>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
            {["MALE", "FEMALE", "OTHER"].map((g) => (
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
        <Field label="Default rent / month (₹, optional)" value={rent} onChangeText={setRent} keyboardType="number-pad" placeholder="e.g. 7000" />
        <Muted style={{ fontSize: 12 }}>Used only to prefill a student&apos;s fee. Fees are charged per student.</Muted>
        {capacity ? (
          <Pressable onPress={() => setBeds(!beds)}>
            <Text style={{ color: beds ? colors.primary : colors.muted }}>
              {beds ? "☑" : "☐"} Create {Math.max(1, parseInt(capacity, 10))} beds automatically (B1, B2…)
            </Text>
          </Pressable>
        ) : null}
        <ErrorText>{err}</ErrorText>
        <Row style={{ gap: space(3) }}>
          <Button label="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
          <Button label="Create room" loading={busy} onPress={submit} />
        </Row>
      </ScrollView>
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