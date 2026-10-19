import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, ErrorText, Loading, Muted } from "@/components/ui";
import { Avatar } from "@/components/documents";
import { createStudent, uploadDocument } from "@/lib/endpoints";
import { chooseImage, type PickedImage } from "@/lib/images";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Room } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function NewStudent() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data, loading } = useApi<{ rooms: Room[] }>("/rooms");
  const input = [
    inputStyle,
    { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
  ];
  const labelStyle = { fontWeight: "700" as const, color: colors.text };
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [studentIdDoc, setStudentIdDoc] = useState<PickedImage | null>(null);
  const [parentIdDoc, setParentIdDoc] = useState<PickedImage | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [bedId, setBedId] = useState<string | null>(null);
  const [fee, setFee] = useState("");
  const [paidNow, setPaidNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rooms = data?.rooms ?? [];
  const selected = rooms.find((r) => r.id === roomId);
  const beds = selected?.beds ?? [];

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await createStudent({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        guardianName: guardianName.trim() || undefined,
        guardianPhone: guardianPhone.trim() || undefined,
        guardianEmail: guardianEmail.trim() || undefined,
        photoUrl: photo?.dataUrl,
        monthlyFee: fee.trim()
          ? Math.max(0, parseInt(fee.replace(/\D/g, ""), 10) || 0)
          : undefined,
        paidForCurrentMonth: paidNow,
        roomId: roomId ?? undefined,
        bedId: bedId ?? undefined,
      });
      const studentId = res.student.id;
      if (studentIdDoc) {
        await uploadDocument({
          studentId,
          type: "ID_PROOF",
          title: "Student ID",
          dataUrl: studentIdDoc.dataUrl,
          mimeType: studentIdDoc.mimeType,
        });
      }
      if (parentIdDoc) {
        await uploadDocument({
          studentId,
          type: "ID_PROOF",
          title: "Parent ID",
          dataUrl: parentIdDoc.dataUrl,
          mimeType: parentIdDoc.mimeType,
        });
      }
      router.back();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <ScrollView
      contentContainerStyle={{
        padding: space(4),
        gap: space(4),
        width: "100%",
        maxWidth: 640,
        alignSelf: "center",
      }}
    >
      <Card style={{ gap: space(3) }}>
        <Text style={labelStyle}>Photo</Text>
        <View style={styles.photoRow}>
          <Avatar uri={photo?.dataUrl} name={firstName || "New"} size={72} />
          <View style={{ flex: 1, gap: space(2) }}>
            <Button
              label={photo ? "Change photo" : "Add photo"}
              variant="ghost"
              size="sm"
              icon="camera-outline"
              onPress={async () => {
                const picked = await chooseImage("Student photo");
                if (picked) setPhoto(picked);
              }}
            />
            {photo ? (
              <Pressable onPress={() => setPhoto(null)}>
                <Muted>Remove photo</Muted>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={labelStyle}>Student details</Text>
        <TextInput value={firstName} onChangeText={setFirstName} placeholder="First name *" placeholderTextColor={colors.muted} style={input} />
        <TextInput value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor={colors.muted} style={input} />
        <TextInput value={phone} onChangeText={setPhone} placeholder="Phone" placeholderTextColor={colors.muted} keyboardType="phone-pad" style={input} />
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="Address"
          placeholderTextColor={colors.muted}
          style={[input, { minHeight: 72, textAlignVertical: "top" }]}
          multiline
        />
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={labelStyle}>Parent / guardian</Text>
        <TextInput value={guardianName} onChangeText={setGuardianName} placeholder="Guardian name" placeholderTextColor={colors.muted} style={input} />
        <TextInput value={guardianPhone} onChangeText={setGuardianPhone} placeholder="Guardian phone" placeholderTextColor={colors.muted} keyboardType="phone-pad" style={input} />
        <TextInput
          value={guardianEmail}
          onChangeText={setGuardianEmail}
          placeholder="Guardian email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          style={input}
        />
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={labelStyle}>Documents</Text>
        <DocSlot
          label="Student ID"
          image={studentIdDoc}
          onPick={async () => {
            const picked = await chooseImage("Student ID");
            if (picked) setStudentIdDoc(picked);
          }}
          onClear={() => setStudentIdDoc(null)}
        />
        <DocSlot
          label="Parent ID"
          image={parentIdDoc}
          onPick={async () => {
            const picked = await chooseImage("Parent ID");
            if (picked) setParentIdDoc(picked);
          }}
          onClear={() => setParentIdDoc(null)}
        />
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={labelStyle}>Monthly fee (₹)</Text>
        <TextInput
          value={fee}
          onChangeText={setFee}
          placeholder="e.g. 7000"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          style={input}
        />
        <Muted>Charged per student, not per room. Picking a room prefills its default rent.</Muted>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>Paid for current month</Text>
            <Muted>{"Record this month's fee as received now."}</Muted>
          </View>
          <Switch
            value={paidNow}
            onValueChange={setPaidNow}
            disabled={fee.trim().length === 0}
          />
        </View>
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={labelStyle}>Room / bed (optional)</Text>
        <View style={styles.chips}>
          {rooms.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => {
                setRoomId(r.id);
                setBedId(null);
                if (!fee.trim() && r.rentAmount != null) setFee(String(r.rentAmount));
              }}
              style={[
                styles.chip,
                { borderColor: colors.border, backgroundColor: colors.bg },
                roomId === r.id && { backgroundColor: colors.primarySolid, borderColor: colors.primarySolid },
              ]}
            >
              <Text style={[styles.chipText, { color: roomId === r.id ? colors.onPrimary : colors.text }]}>
                Room {r.roomNumber}
              </Text>
            </Pressable>
          ))}
          {rooms.length === 0 ? <Muted>No rooms yet — create a room first</Muted> : null}
        </View>
        {selected ? (
          <View style={styles.chips}>
            {beds.map((b) => (
              <Pressable
                key={b.id}
                onPress={() => setBedId((cur) => (cur === b.id ? null : b.id))}
                style={[
                  styles.chip,
                  { borderColor: colors.border, backgroundColor: colors.bg },
                  bedId === b.id && { backgroundColor: colors.primarySolid, borderColor: colors.primarySolid },
                ]}
              >
                <Text style={[styles.chipText, { color: bedId === b.id ? colors.onPrimary : colors.text }]}>
                  {b.label}
                </Text>
              </Pressable>
            ))}
            {beds.length === 0 ? <Muted>No beds in this room</Muted> : null}
          </View>
        ) : null}
      </Card>

      <ErrorText>{err}</ErrorText>
      <Button
        label="Create student"
        disabled={firstName.trim().length === 0}
        loading={busy}
        size="sm"
        alignSelf="center"
        icon="checkmark-circle-outline"
        onPress={submit}
      />
    </ScrollView>
  );
}

function DocSlot({
  label,
  image,
  onPick,
  onClear,
}: {
  label: string;
  image: PickedImage | null;
  onPick: () => void;
  onClear: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space(2) }}>
      <Muted>{label}</Muted>
      <View style={styles.photoRow}>
        {image ? (
          <Image source={{ uri: image.dataUrl }} style={[styles.docThumb, { backgroundColor: colors.cardAlt }]} />
        ) : (
          <View style={[styles.docThumb, styles.docEmpty, { backgroundColor: colors.cardAlt }]}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>No image</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: space(2) }}>
          <Button label={image ? "Replace" : "Add image"} variant="ghost" size="sm" icon="image-outline" onPress={onPick} />
          {image ? (
            <Pressable onPress={onClear}>
              <Muted>Remove</Muted>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderRadius: radius.sm,
  paddingHorizontal: space(3),
  paddingVertical: space(3),
  fontSize: 15,
};

const styles = StyleSheet.create({
  photoRow: { flexDirection: "row", alignItems: "center", gap: space(3) },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space(3) },
  docThumb: { width: 72, height: 72, borderRadius: radius.sm },
  docEmpty: { alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  chip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
  },
  chipText: { fontWeight: "600" as const },
});
