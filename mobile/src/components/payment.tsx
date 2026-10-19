import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { saveBase64File } from "@/lib/download";
import type { ComponentProps } from "react";
import { useState } from "react";
import { Alert, Image, Linking, Pressable, Text, View } from "react-native";
import { Button, Card, ErrorText, Muted, SectionTitle, SkeletonCard } from "@/components/ui";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { TenantBranding } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** Shows the owner's UPI (with QR scanner) and bank details so students & parents can pay. */
type IoniconName = ComponentProps<typeof Ionicons>["name"];

/** UPI deep links: each app registers its own URL scheme (plus the universal upi://). */
type UpiApp = {
  name: string;
  icon: IoniconName;
  schemes: string[];
};
const UPI_APPS: UpiApp[] = [
  { name: "G-Pay", icon: "logo-google", schemes: ["tez://upi/pay", "gpay://upi/pay"] },
  { name: "PhonePe", icon: "phone-portrait-outline", schemes: ["phonepe://pay"] },
  { name: "Paytm", icon: "wallet-outline", schemes: ["paytmmp://pay", "paytm://pay"] },
];

export function PaymentInfo({ tenant }: { tenant?: TenantBranding | null }) {
  const { colors } = useTheme();
  const { data, loading } = useApi<{ tenant: TenantBranding }>(tenant === undefined ? "/tenant" : null);
  const [sharingQr, setSharingQr] = useState(false);
  const [payingUpi, setPayingUpi] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const t = tenant ?? data?.tenant;
  if (!t) return loading ? <SkeletonCard lines={4} /> : null;

  const has =
    Boolean(t.upiId || t.upiQrUrl || t.bankName || t.bankAccountName || t.bankAccountNumber || t.bankIfsc);
  if (!has) return null;

  const copy = (value: string, what: string) => {
    Clipboard.setStringAsync(value);
    Alert.alert("Copied", `${what} copied to clipboard.`);
  };

  const shareQr = async () => {
    if (!t?.upiQrUrl) return;
    setSharingQr(true);
    setErr(null);
    try {
      const dataUrl = t.upiQrUrl.startsWith("data:") ? t.upiQrUrl : null;
      let base64 = "";
      let mime = "image/png";
      if (dataUrl) {
        const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
        mime = match?.[1] ?? "image/png";
        base64 = match?.[2] ?? "";
      } else {
        const cached = await File.downloadFileAsync(t.upiQrUrl, new File(Paths.cache, "upi-qr.png"));
        base64 = await LegacyFileSystem.readAsStringAsync(cached.uri, {
          encoding: LegacyFileSystem.EncodingType.Base64,
        });
      }
      const ext = mime === "image/jpeg" || mime === "image/jpg" ? "jpg" : "png";
      await saveBase64File(base64, `upi-qr.${ext}`, mime);
      Alert.alert("Downloaded", "UPI QR code saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the QR code");
    } finally {
      setSharingQr(false);
    }
  };

  /** Opens the chosen UPI app with the PG's details pre-filled, falling back to the universal UPI link. */
  const openUpi = async (app: UpiApp) => {
    const upiId = t?.upiId;
    if (!upiId) {
      setErr("The owner has not set a UPI ID yet.");
      return;
    }
    setPayingUpi(app.name);
    setErr(null);
    const query =
      `pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(t?.name ?? "PG")}` +
      `&tn=${encodeURIComponent("Fees payment")}&cu=INR`;
    const candidates = [...app.schemes.map((s) => `${s}?${query}`), `upi://pay?${query}`];

    let opened = false;
    for (const url of candidates) {
      try {
        await Linking.openURL(url);
        opened = true;
        break;
      } catch {
        // App not installed / scheme unhandled — try the next candidate.
      }
    }
    if (!opened) setErr("Couldn't open the UPI app. Make sure it is installed.");
    setPayingUpi(null);
  };

  return (
    <Card style={{ gap: space(3) }} tone="soft">
      <View>
        <SectionTitle>Pay your fees</SectionTitle>
        <Muted>Send payment to the PG and keep the slip as proof.</Muted>
      </View>

      {t.upiQrUrl ? (
        <View style={{ alignItems: "center", gap: space(3) }}>
          <Image
            source={{ uri: t.upiQrUrl }}
            style={{
              width: 150,
              height: 150,
              borderRadius: radius.md,
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: colors.border,
            }}
            resizeMode="contain"
          />
          <Muted>Scan to pay via any UPI app</Muted>
          <Button
            label="Download QR"
            variant="ghost"
            icon="download-outline"
            loading={sharingQr}
            onPress={shareQr}
          />
          <ErrorText>{err}</ErrorText>
        </View>
      ) : null}

      {t.upiId ? (
        <Pressable onPress={() => copy(t.upiId!, "UPI ID")} style={copyRow}>
          <View style={[tile, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="flash-outline" color={colors.primary} size={18} />
          </View>
          <View style={{ flex: 1 }}>
            <Muted>UPI ID</Muted>
            <Text style={{ fontWeight: "700", color: colors.text }}>{t.upiId}</Text>
          </View>
          <Ionicons name="copy-outline" color={colors.muted} size={18} />
        </Pressable>
      ) : null}

      {t.upiId ? (
        <View style={{ gap: space(2) }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>
            Pay with UPI app
          </Text>
          <View style={{ flexDirection: "row", gap: space(2) }}>
            {UPI_APPS.map((app) => (
              <View key={app.name} style={{ flex: 1 }}>
                <Button
                  label={app.name}
                  variant="ghost"
                  icon={app.icon}
                  loading={payingUpi === app.name}
                  onPress={() => openUpi(app)}
                />
              </View>
            ))}
          </View>
          <ErrorText>{err}</ErrorText>
        </View>
      ) : null}

      {t.bankName || t.bankAccountName || t.bankAccountNumber || t.bankIfsc ? (
        <View style={{ gap: space(2) }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>Bank transfer</Text>
          {t.bankName ? (
            <Detail label="Bank" value={t.bankName} />
          ) : null}
          {t.bankAccountName ? <Detail label="Account holder" value={t.bankAccountName} /> : null}
          {t.bankAccountNumber ? (
            <Pressable onPress={() => copy(t.bankAccountNumber!, "Account number")} style={copyRow}>
              <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.muted, fontSize: 13 }}>Account number</Text>
                <Text style={{ fontWeight: "700", color: colors.text, marginRight: space(2) }}>
                  {t.bankAccountNumber}
                </Text>
              </View>
              <Ionicons name="copy-outline" color={colors.muted} size={18} />
            </Pressable>
          ) : null}
          {t.bankIfsc ? (
            <Pressable onPress={() => copy(t.bankIfsc!, "IFSC")} style={copyRow}>
              <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.muted, fontSize: 13 }}>IFSC</Text>
                <Text style={{ fontWeight: "700", color: colors.text, marginRight: space(2) }}>
                  {t.bankIfsc}
                </Text>
              </View>
              <Ionicons name="copy-outline" color={colors.muted} size={18} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const copyRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: space(3),
  paddingVertical: space(2),
};

const tile = {
  width: 32,
  height: 32,
  borderRadius: radius.pill,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

function Detail({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ fontWeight: "700", color: colors.text }}>{value}</Text>
    </View>
  );
}