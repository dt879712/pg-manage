import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, ErrorText, Muted } from "@/components/ui";
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
  const { data, loading, error: roomsError, reload: reloadRooms } = useApi<{ rooms: Room[] }>("/rooms");
  const input = [
    inputStyle,
    { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
  ];
  const labelStyle = { fontWeight: "700" as const, color: colors.text };
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [address, setAddress] = useState("");
  const [joinDate, setJoinDate] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [studentIdFront, setStudentIdFront] = useState<PickedImage | null>(null);
  const [studentIdBack, setStudentIdBack] = useState<PickedImage | null>(null);
  const [parentIdFront, setParentIdFront] = useState<PickedImage | null>(null);
  const [parentIdBack, setParentIdBack] = useState<PickedImage | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [bedId, setBedId] = useState<string | null>(null);
  const [fee, setFee] = useState("");
  const [paidNow, setPaidNow] = useState("");
  const [studentLoginId, setStudentLoginId] = useState("");
  const [studentLoginPass, setStudentLoginPass] = useState("");
  const [parentLoginId, setParentLoginId] = useState("");
  const [parentLoginPass, setParentLoginPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [roomQuery, setRoomQuery] = useState("");
  const rooms = data?.rooms ?? [];
  const query = roomQuery.trim().toLowerCase();
  const visibleRooms = query
    ? rooms.filter((r) => r.roomNumber.toLowerCase().includes(query))
    : rooms;
  const selected = rooms.find((r) => r.id === roomId);
  const beds = selected?.beds ?? [];

  const submit = async () => {
    if (studentLoginId.trim() && studentLoginPass.trim().length < 6) {
      setErr("Student password must be at least 6 characters.");
      return;
    }
    if (parentLoginId.trim() && parentLoginPass.trim().length < 6) {
      setErr("Parent password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await createStudent({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
        dob: dob.trim() || undefined,
        address: address.trim() || undefined,
        guardianName: guardianName.trim() || undefined,
        guardianPhone: guardianPhone.trim() || undefined,
        guardianEmail: guardianEmail.trim() || undefined,
        photoUrl: photo?.dataUrl,
        studentEmail: studentLoginId.includes("@") ? studentLoginId.trim() : undefined,
        studentPhone: studentLoginId.trim() && !studentLoginId.includes("@") ? studentLoginId.trim() : undefined,
        studentPassword: studentLoginId.trim() ? studentLoginPass.trim() : undefined,
        parentEmail: parentLoginId.includes("@") ? parentLoginId.trim() : undefined,
        parentPhone: parentLoginId.trim() && !parentLoginId.includes("@") ? parentLoginId.trim() : undefined,
        parentPassword: parentLoginId.trim() ? parentLoginPass.trim() : undefined,
        monthlyFee: fee.trim()
          ? Math.max(0, parseInt(fee.replace(/\D/g, ""), 10) || 0)
          : undefined,
        paidForCurrentMonth: paidNow.trim()
          ? Math.max(0, parseInt(paidNow.replace(/\D/g, ""), 10) || 0) > 0
          : false,
        paidAmount: paidNow.trim()
          ? Math.max(0, parseInt(paidNow.replace(/\D/g, ""), 10) || 0)
          : undefined,
        roomId: roomId ?? undefined,
        bedId: bedId ?? undefined,
        joinDate: joinDate.trim() ? joinDate.trim() : undefined,
      });
      const studentId = res.student.id;
      const docs: { title: string; side: "front" | "back"; image: PickedImage | null }[] = [
        { title: "Student ID", side: "front", image: studentIdFront },
        { title: "Student ID", side: "back", image: studentIdBack },
        { title: "Parent ID", side: "front", image: parentIdFront },
        { title: "Parent ID", side: "back", image: parentIdBack },
      ];
      for (const doc of docs) {
        if (!doc.image) continue;
        // The student already exists at this point; a failed document upload
        // must not make the form look like the save failed (which would lead
        // to duplicate students on retry).
        try {
          await uploadDocument({
            studentId,
            type: "ID_PROOF",
            title: doc.title,
            side: doc.side,
            dataUrl: doc.image.dataUrl,
            mimeType: doc.image.mimeType,
          });
        } catch {
          // Document can be added later from the student profile.
        }
      }
      router.back();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  };

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
          value={dob}
          onChangeText={setDob}
          placeholder="Date of birth (YYYY-MM-DD)"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          style={input}
        />
        <TextInput
          value={joinDate}
          onChangeText={setJoinDate}
          placeholder="Admission date (YYYY-MM-DD)"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          style={input}
        />
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
        <Text style={labelStyle}>Login details</Text>
        <Muted>
          Set a login for the student and the parent so each can sign in with their own mobile
          number or email. Leave a section blank to skip it.
        </Muted>

        <Text style={{ color: colors.text, fontWeight: "600" }}>Student</Text>
        <TextInput
          value={studentLoginId}
          onChangeText={setStudentLoginId}
          placeholder="Student mobile number or email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          style={input}
        />
        <TextInput
          value={studentLoginPass}
          onChangeText={setStudentLoginPass}
          placeholder="Student password (min 6 characters)"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          secureTextEntry
          style={input}
        />

        <Text style={{ color: colors.text, fontWeight: "600", marginTop: space(2) }}>Parent</Text>
        <TextInput
          value={parentLoginId}
          onChangeText={setParentLoginId}
          placeholder="Parent mobile number or email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          style={input}
        />
        <TextInput
          value={parentLoginPass}
          onChangeText={setParentLoginPass}
          placeholder="Parent password (min 6 characters)"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          secureTextEntry
          style={input}
        />
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={labelStyle}>Documents</Text>
        <DocSlot
          label="Student ID (front)"
          image={studentIdFront}
          onPick={async () => {
            const picked = await chooseImage("Student ID front");
            if (picked) setStudentIdFront(picked);
          }}
          onClear={() => setStudentIdFront(null)}
        />
        <DocSlot
          label="Student ID (back)"
          image={studentIdBack}
          onPick={async () => {
            const picked = await chooseImage("Student ID back");
            if (picked) setStudentIdBack(picked);
          }}
          onClear={() => setStudentIdBack(null)}
        />
        <DocSlot
          label="Parent ID (front)"
          image={parentIdFront}
          onPick={async () => {
            const picked = await chooseImage("Parent ID front");
            if (picked) setParentIdFront(picked);
          }}
          onClear={() => setParentIdFront(null)}
        />
        <DocSlot
          label="Parent ID (back)"
          image={parentIdBack}
          onPick={async () => {
            const picked = await chooseImage("Parent ID back");
            if (picked) setParentIdBack(picked);
          }}
          onClear={() => setParentIdBack(null)}
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
        <View style={{ gap: 2 }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>Paid now (₹)</Text>
          <TextInput
            value={paidNow}
            onChangeText={setPaidNow}
            placeholder="Leave blank if nothing paid yet"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            editable={fee.trim().length > 0}
            style={[input, fee.trim().length === 0 && { opacity: 0.5 }]}
          />
          <Muted>
            The first month&apos;s fee is added to the due list automatically. Enter any amount
            collected now — part payments show the remaining balance.
          </Muted>
        </View>
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={labelStyle}>Room / bed (optional)</Text>
        {roomsError ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
            <Muted style={{ flex: 1 }}>Couldn&apos;t load rooms: {roomsError}</Muted>
            <Button label="Retry" size="sm" variant="ghost" onPress={reloadRooms} />
          </View>
        ) : null}
        {loading && rooms.length === 0 ? <Muted>Loading rooms…</Muted> : null}
        {rooms.length > 12 ? (
          <TextInput
            value={roomQuery}
            onChangeText={setRoomQuery}
            placeholder="Search room number"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={input}
          />
        ) : null}
        <View style={styles.chips}>
          {visibleRooms.map((r) => (
            <Pressable
              key={r.id}
              disabled={r.status !== "ACTIVE"}
              onPress={() => {
                setRoomId(r.id);
                setBedId(null);
                if (!fee.trim() && r.rentAmount != null) setFee(String(r.rentAmount));
              }}
              style={[
                styles.chip,
                { borderColor: colors.border, backgroundColor: colors.bg },
                r.status !== "ACTIVE" && { opacity: 0.4 },
                roomId === r.id && { backgroundColor: colors.primarySolid, borderColor: colors.primarySolid },
              ]}
            >
              <Text style={[styles.chipText, { color: roomId === r.id ? colors.onPrimary : colors.text }]}>
                Room {r.roomNumber}{r.status !== "ACTIVE" ? " (unavailable)" : ""}
              </Text>
            </Pressable>
          ))}
          {!loading && !roomsError && rooms.length === 0 ? (
            <Muted>No rooms yet — create a room first</Muted>
          ) : null}
          {rooms.length > 0 && visibleRooms.length === 0 ? (
            <Muted>No room matches &quot;{roomQuery.trim()}&quot;</Muted>
          ) : null}
        </View>
        {selected ? (
          <View style={styles.chips}>
            {beds.map((b) => {
              const taken = b.status !== "VACANT";
              return (
                <Pressable
                  key={b.id}
                  disabled={taken}
                  onPress={() => setBedId((cur) => (cur === b.id ? null : b.id))}
                  style={[
                    styles.chip,
                    { borderColor: colors.border, backgroundColor: colors.bg },
                    taken && { opacity: 0.4 },
                    bedId === b.id && { backgroundColor: colors.primarySolid, borderColor: colors.primarySolid },
                  ]}
                >
                  <Text style={[styles.chipText, { color: bedId === b.id ? colors.onPrimary : colors.text }]}>
                    {b.label}{taken ? " ●" : ""}
                  </Text>
                </Pressable>
              );
            })}
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
