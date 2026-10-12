import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Logo } from "@/components/logo";
import { Button, Card, ErrorText, Muted, SectionTitle } from "@/components/ui";
import { getPublicPg, submitAdmission, type ApplyAdmissionInput } from "@/lib/endpoints";
import { chooseImage, type PickedImage } from "@/lib/images";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { PublicPg } from "@/lib/types";

export default function Apply() {
  const { colors } = useTheme();
  const router = useRouter();
  const [pg, setPg] = useState<PublicPg | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [address, setAddress] = useState("");
  const [course, setCourse] = useState("");
  const [college, setCollege] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [studentIdDoc, setStudentIdDoc] = useState<PickedImage | null>(null);
  const [parentIdDoc, setParentIdDoc] = useState<PickedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getPublicPg()
      .then((r) => setPg(r.pg))
      .catch(() => setPg(null));
  }, []);

  const input = [
    inputStyle,
    { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
  ];

  const submit = async () => {
    setErr(null);
    const em = email.trim().toLowerCase();
    if (!firstName.trim()) return setErr("Please enter your first name.");
    if (!/^[\d\s+()-]{7,}$/.test(phone.trim())) return setErr("Please enter a valid phone number.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return setErr("Please enter a valid email address.");
    if (password.length < 6) return setErr("Password must be at least 6 characters.");
    if (!studentIdDoc) return setErr("Please add the student ID document.");
    if (!photo) return setErr("Please add your photo.");
    if (!parentIdDoc) return setErr("Please add the parent / guardian ID document.");

    const payload: ApplyAdmissionInput = {
      firstName: firstName.trim(),
      lastName: lastName.trim() || undefined,
      gender: gender ?? undefined,
      phone: phone.trim(),
      email: em,
      address: address.trim() || undefined,
      course: course.trim() || undefined,
      college: college.trim() || undefined,
      guardianName: guardianName.trim() || undefined,
      guardianPhone: guardianPhone.trim() || undefined,
      password,
      documents: [
        { type: "ID_PROOF", title: "Student ID", dataUrl: studentIdDoc.dataUrl, mimeType: studentIdDoc.mimeType },
        { type: "PHOTO", title: "Student photo", dataUrl: photo.dataUrl, mimeType: photo.mimeType },
        { type: "ID_PROOF", title: "Parent ID", dataUrl: parentIdDoc.dataUrl, mimeType: parentIdDoc.mimeType },
      ],
    };

    setBusy(true);
    try {
      await submitAdmission(payload);
      router.replace({ pathname: "/apply/pending", params: { email: em, phone: phone.trim() } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to submit application");
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          padding: space(4),
          gap: space(4),
          paddingBottom: space(12),
          alignItems: "center",
        }}
      >
        <View style={{ width: "100%", maxWidth: 640, gap: space(4) }}>
        <Card style={{ gap: space(3), alignItems: "center" }}>
          <Logo size={56} />
          <View style={{ alignItems: "center", gap: 2 }}>
            <Text style={{ fontWeight: "800", fontSize: 18, color: colors.text }}>
              {pg?.name ?? "Dev Hostel"}
            </Text>
            <Muted style={{ textAlign: "center" }}>
              {pg?.description ?? "Apply for hostel admission in minutes."}
            </Muted>
            {pg?.address ? (
              <Muted style={{ fontSize: 12 }}>{pg.address}</Muted>
            ) : null}
          </View>
        </Card>

        <View>
          <SectionTitle>Your details</SectionTitle>
          <Card style={{ gap: space(3), marginTop: space(2) }}>
            <TextInput value={firstName} onChangeText={setFirstName} placeholder="First name *" placeholderTextColor={colors.muted} style={input} />
            <TextInput value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor={colors.muted} style={input} />
            <View style={{ gap: space(2) }}>
              <Muted>Gender (optional)</Muted>
              <View style={styles.chips}>
                {["MALE", "FEMALE", "OTHER"].map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => setGender(gender === g ? null : g)}
                    style={[
                      styles.chip,
                      { borderColor: colors.border, backgroundColor: colors.bg },
                      gender === g && { backgroundColor: colors.primarySolid, borderColor: colors.primarySolid },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: gender === g ? colors.onPrimary : colors.text }]}>
                      {g}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <TextInput value={phone} onChangeText={setPhone} placeholder="Phone number *" placeholderTextColor={colors.muted} keyboardType="phone-pad" style={input} />
            <TextInput value={course} onChangeText={setCourse} placeholder="Course (optional)" placeholderTextColor={colors.muted} style={input} />
            <TextInput value={college} onChangeText={setCollege} placeholder="College / university (optional)" placeholderTextColor={colors.muted} style={input} />
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="Home address"
              placeholderTextColor={colors.muted}
              style={[input, { minHeight: 72, textAlignVertical: "top" }]}
              multiline
            />
          </Card>
        </View>

        <View>
          <SectionTitle>Set up your account</SectionTitle>
          <Card style={{ gap: space(3), marginTop: space(2) }}>
            <TextInput value={email} onChangeText={setEmail} placeholder="Email *" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" style={input} />
            <View style={{ gap: 6 }}>
              <Muted>Choose a password (you will use it to sign in once approved)</Muted>
              <View>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password *"
                  placeholderTextColor={colors.muted}
                  secureTextEntry={!showPassword}
                  style={[input, { paddingRight: space(9) }]}
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  style={{ position: "absolute", right: space(3), top: 0, bottom: 0, justifyContent: "center" }}
                >
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} color={colors.muted} size={20} />
                </Pressable>
              </View>
            </View>
          </Card>
        </View>

        <View>
          <SectionTitle>Parent / guardian</SectionTitle>
          <Card style={{ gap: space(3), marginTop: space(2) }}>
            <TextInput value={guardianName} onChangeText={setGuardianName} placeholder="Guardian name" placeholderTextColor={colors.muted} style={input} />
            <TextInput value={guardianPhone} onChangeText={setGuardianPhone} placeholder="Guardian phone" placeholderTextColor={colors.muted} keyboardType="phone-pad" style={input} />
          </Card>
        </View>

        <View>
          <SectionTitle>Required documents</SectionTitle>
          <Card style={{ gap: space(3), marginTop: space(2) }}>
            <DocSlot
              label="Student ID (Aadhaar / ID card) *"
              image={studentIdDoc}
              onPick={async () => {
                const picked = await chooseImage("Student ID");
                if (picked) setStudentIdDoc(picked);
              }}
              onClear={() => setStudentIdDoc(null)}
            />
            <DocSlot
              label="Student photo *"
              image={photo}
              onPick={async () => {
                const picked = await chooseImage("Student photo");
                if (picked) setPhoto(picked);
              }}
              onClear={() => setPhoto(null)}
            />
            <DocSlot
              label="Parent / guardian ID *"
              image={parentIdDoc}
              onPick={async () => {
                const picked = await chooseImage("Parent ID");
                if (picked) setParentIdDoc(picked);
              }}
              onClear={() => setParentIdDoc(null)}
            />
          </Card>
        </View>

        <ErrorText>{err}</ErrorText>
        <Button label="Submit application" loading={busy} onPress={submit} block />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
            <Ionicons name="camera-outline" color={colors.muted} size={22} />
          </View>
        )}
        <View style={{ flex: 1, gap: space(2) }}>
          <Button label={image ? "Replace" : "Add image"} variant="ghost" onPress={onPick} />
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