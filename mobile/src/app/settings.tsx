import { useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button, Card, ErrorText, Loading, Muted, Row } from "@/components/ui";
import { Avatar } from "@/components/documents";
import { confirmAction, notify } from "@/lib/dialog";
import { addTenantImage, deleteTenantImage, updateTenant, updateUser } from "@/lib/endpoints";
import { chooseImage } from "@/lib/images";
import { useAuth } from "@/lib/auth";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { TenantBranding } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { user, setUser } = useAuth();
  const { data, loading, error, reload } = useApi<{ tenant: TenantBranding }>("/tenant");
  const [form, setForm] = useState<Partial<TenantBranding> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [ownerEmail, setOwnerEmail] = useState(user?.email ?? "");
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerErr, setOwnerErr] = useState<string | null>(null);
  const labelStyle = { fontWeight: "700" as const, color: colors.text };

  if (loading) return <Loading />;
  const t = data?.tenant;
  if (!t) return <ErrorText>{error || "Not found"}</ErrorText>;

  const v = form ?? {};
  const get = (k: keyof TenantBranding) => (v[k] ?? t[k] ?? "") as string;
  const set = (k: keyof TenantBranding) => (value: string) => setForm({ ...v, [k]: value });

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await updateTenant({
        name: get("name").trim(),
        description: get("description").trim(),
        address: get("address").trim(),
        city: get("city").trim(),
        phone: get("phone").trim(),
        email: get("email").trim(),
        primaryColor: get("primaryColor").trim(),
      });
      setForm(null);
      reload();
      notify("Saved", "PG details updated.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const saveOwnerEmail = async () => {
    if (!user) return;
    const next = ownerEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) {
      setOwnerErr("Enter a valid email address");
      return;
    }
    setOwnerBusy(true);
    setOwnerErr(null);
    try {
      const r = await updateUser(user.id, { email: next });
      setUser({ ...user, email: r.user.email });
      notify("Saved", "Owner sign-in email updated. Use it to sign in next time.");
    } catch (e) {
      setOwnerErr(e instanceof Error ? e.message : "Failed to update email");
    } finally {
      setOwnerBusy(false);
    }
  };

  const savePay = async () => {
    setBusy(true);
    setPayErr(null);
    try {
      await updateTenant({
        receiptFooter: get("receiptFooter").trim(),
        upiId: get("upiId").trim(),
        bankName: get("bankName").trim(),
        bankAccountName: get("bankAccountName").trim(),
        bankAccountNumber: get("bankAccountNumber").trim(),
        bankIfsc: get("bankIfsc").trim(),
      });
      setForm(null);
      reload();
      notify("Saved", "Payment details updated. These print on every receipt.");
    } catch (e) {
      setPayErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const setQr = async (remove?: boolean) => {
    if (remove) {
      setBusy(true);
      setPayErr(null);
      try {
        await updateTenant({ upiQrUrl: null });
        reload();
      } catch (e) {
        setPayErr(e instanceof Error ? e.message : "Failed");
      } finally {
        setBusy(false);
      }
      return;
    }
    const picked = await chooseImage("UPI QR code");
    if (!picked) return;
    setBusy(true);
    setPayErr(null);
    try {
      await updateTenant({ upiQrUrl: picked.dataUrl });
      reload();
    } catch (e) {
      setPayErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const setLogo = async () => {
    const picked = await chooseImage("PG logo");
    if (!picked) return;
    setBusy(true);
    setErr(null);
    try {
      await updateTenant({ logoUrl: picked.dataUrl });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const addImage = async () => {
    const picked = await chooseImage("Home banner");
    if (!picked) return;
    setBusy(true);
    setErr(null);
    try {
      await addTenantImage({ dataUrl: picked.dataUrl });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }}>
      {user ? (
        <Card style={{ gap: space(3) }}>
          <Text style={labelStyle}>Owner account (sign-in email)</Text>
          <Muted>This is the email you sign in with. Password-reset emails go here.</Muted>
          <Field
            label="Sign-in email"
            value={ownerEmail}
            onChangeText={setOwnerEmail}
            keyboardType="email-address"
          />
          <ErrorText>{ownerErr}</ErrorText>
          <Button label="Update owner email" loading={ownerBusy} onPress={saveOwnerEmail} />
        </Card>
      ) : null}

      <Card style={{ gap: space(3) }}>
        <Text style={labelStyle}>Logo</Text>
        <Row style={{ gap: space(3) }}>
          <Avatar uri={t.logoUrl} name={t.name} size={64} />
          <View style={{ flex: 1, gap: space(2) }}>
            <Button label={t.logoUrl ? "Change logo" : "Add logo"} variant="ghost" loading={busy} onPress={setLogo} />
            {t.logoUrl ? (
              <Pressable
                onPress={async () => {
                  await updateTenant({ logoUrl: null });
                  reload();
                }}
              >
                <Muted>Remove logo</Muted>
              </Pressable>
            ) : null}
          </View>
        </Row>
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={labelStyle}>PG details</Text>
        <Field label="Name" value={get("name")} onChangeText={set("name")} />
        <Field label="Description" value={get("description")} onChangeText={set("description")} multiline />
        <Field label="Address" value={get("address")} onChangeText={set("address")} multiline />
        <Field label="City" value={get("city")} onChangeText={set("city")} />
        <Field label="Phone" value={get("phone")} onChangeText={set("phone")} keyboardType="phone-pad" />
        <Field
          label="PG email (on receipts)"
          value={get("email")}
          onChangeText={set("email")}
          keyboardType="email-address"
        />
        <Field label="Brand colour (hex)" value={get("primaryColor")} onChangeText={set("primaryColor")} autoCapitalize="none" />
        <ErrorText>{err}</ErrorText>
        <Button label="Save details" loading={busy} onPress={save} />
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={labelStyle}>Payment details on receipt</Text>
        <Muted>Printed on every fee receipt / pay slip you generate.</Muted>
        <Field
          label="Receipt footer (terms / thank-you note)"
          value={get("receiptFooter")}
          onChangeText={set("receiptFooter")}
          multiline
        />
        <Field label="UPI ID" value={get("upiId")} onChangeText={set("upiId")} autoCapitalize="none" />
        <View style={{ gap: space(2) }}>
          <Muted>UPI QR scanner</Muted>
          <Row style={{ gap: space(3) }}>
            {t.upiQrUrl ? (
              <Image source={{ uri: t.upiQrUrl }} style={[styles.qr, { backgroundColor: colors.cardAlt }]} />
            ) : (
              <View style={[styles.qr, styles.qrEmpty, { backgroundColor: colors.cardAlt }]}>
                <Muted>No QR</Muted>
              </View>
            )}
            <View style={{ flex: 1, gap: space(2) }}>
              <Button
                label={t.upiQrUrl ? "Change QR code" : "Add QR code"}
                variant="ghost"
                loading={busy}
                onPress={() => setQr()}
              />
              {t.upiQrUrl ? (
                <Pressable onPress={() => setQr(true)}>
                  <Muted>Remove QR code</Muted>
                </Pressable>
              ) : null}
            </View>
          </Row>
        </View>
        <Field label="Bank name" value={get("bankName")} onChangeText={set("bankName")} />
        <Field
          label="Account holder name"
          value={get("bankAccountName")}
          onChangeText={set("bankAccountName")}
        />
        <Field
          label="Account number"
          value={get("bankAccountNumber")}
          onChangeText={set("bankAccountNumber")}
          keyboardType="phone-pad"
        />
        <Field label="IFSC code" value={get("bankIfsc")} onChangeText={set("bankIfsc")} autoCapitalize="none" />
        <ErrorText>{payErr}</ErrorText>
        <Button label="Save payment details" loading={busy} onPress={savePay} />
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={labelStyle}>Home banners</Text>
        <Muted>These images auto-swipe on everyone&apos;s home screen.</Muted>
        <View style={styles.gallery}>
          {t.images.map((img) => (
            <Pressable
              key={img.id}
              onLongPress={async () => {
                const ok = await confirmAction({
                  title: "Delete banner",
                  message: "Remove this image?",
                  confirmLabel: "Delete",
                  destructive: true,
                });
                if (!ok) return;
                await deleteTenantImage(img.id);
                reload();
              }}
            >
              <Image source={{ uri: img.imageUrl }} style={[styles.thumb, { backgroundColor: colors.cardAlt }]} />
            </Pressable>
          ))}
          {t.images.length === 0 ? <Muted>No banners yet</Muted> : null}
        </View>
        <Button label="Add banner image" variant="ghost" loading={busy} onPress={addImage} />
      </Card>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  keyboardType?: "default" | "phone-pad" | "email-address";
  autoCapitalize?: "none";
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Muted>{label}</Muted>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholderTextColor={colors.muted}
        style={[
          inputStyle,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg },
          multiline && { minHeight: 64, textAlignVertical: "top" },
        ]}
      />
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

const styles = {
  gallery: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: space(3) },
  thumb: { width: 96, height: 72, borderRadius: radius.sm },
  qr: { width: 92, height: 92, borderRadius: radius.sm },
  qrEmpty: { alignItems: "center" as const, justifyContent: "center" as const },
};
