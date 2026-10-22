import { useState } from "react";
import type { ReactNode } from "react";
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Card, ErrorText, Muted, Row } from "@/components/ui";
import { uploadDocument } from "@/lib/endpoints";
import { chooseImage } from "@/lib/images";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { DocumentFile } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export function Avatar({ uri, name, size = 56 }: { uri?: string | null; name: string; size?: number }) {
  const { colors } = useTheme();
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.cardAlt }}
      />
    );
  }
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.primary, fontWeight: "700", fontSize: size * 0.38 }}>
        {initials || "?"}
      </Text>
    </View>
  );
}

export function DocumentGallery({
  documents,
  onAdd,
  onDelete,
  busy,
  actions,
}: {
  documents: DocumentFile[];
  onAdd?: () => void;
  onDelete?: (doc: DocumentFile) => void;
  busy?: boolean;
  actions?: ReactNode;
}) {
  const { colors } = useTheme();
  const [viewing, setViewing] = useState<string | null>(null);

  const confirmDelete = (doc: DocumentFile) => {
    if (!onDelete) return;
    Alert.alert("Delete document", "Remove this document?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDelete(doc) },
    ]);
  };

  return (
    <View style={{ gap: space(3) }}>
      <View style={styles.wrap}>
        {documents.map((d) => (
          <Pressable
            key={d.id}
            onPress={() => setViewing(d.fileUrl)}
            onLongPress={() => confirmDelete(d)}
          >
            <Image source={{ uri: d.fileUrl }} style={[styles.thumb, { backgroundColor: colors.cardAlt }]} />
            <Text numberOfLines={1} style={[styles.caption, { color: colors.muted }]}>
              {d.title || d.type}
              {d.side ? ` · ${d.side}` : ""}
            </Text>
          </Pressable>
        ))}
        {documents.length === 0 ? <Muted>No documents uploaded</Muted> : null}
      </View>
      {onAdd ? <Button label="Add document" variant="ghost" loading={busy} onPress={onAdd} /> : null}
      {actions}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.modalBg} onPress={() => setViewing(null)}>
          {viewing ? <Image source={{ uri: viewing }} style={styles.modalImg} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </View>
  );
}

export function MyDocumentsCard() {
  const { colors } = useTheme();
  const { data, loading, error, reload } = useApi<{
    people: { studentId: string; name: string; documents: DocumentFile[] }[];
  }>("/documents/mine");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const people = data?.people ?? [];

  const upload = async (studentId: string, side: "front" | "back") => {
    const picked = await chooseImage(`Upload ID ${side}`);
    if (!picked) return;
    setBusy(true);
    setErr(null);
    try {
      await uploadDocument({
        studentId,
        type: "ID_PROOF",
        title: "ID proof",
        side,
        dataUrl: picked.dataUrl,
        mimeType: picked.mimeType,
      });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to upload");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: space(3) }}>
      <Text style={{ fontWeight: "700", color: colors.text }}>My documents</Text>
      <Muted>
        Upload your ID proof — both the front and back. The PG owner can see these and they are
        added to your admission form PDF.
      </Muted>
      {loading ? <Muted>Loading…</Muted> : null}
      <ErrorText>{error}</ErrorText>
      {people.map((p) => (
        <View key={p.studentId} style={{ gap: space(2) }}>
          {people.length > 1 ? (
            <Text style={{ color: colors.text, fontWeight: "600" }}>{p.name}</Text>
          ) : null}
          <DocumentGallery
            documents={p.documents}
            actions={
              <Row style={{ gap: space(3) }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="ID front"
                    variant="ghost"
                    loading={busy}
                    onPress={() => upload(p.studentId, "front")}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="ID back"
                    variant="ghost"
                    loading={busy}
                    onPress={() => upload(p.studentId, "back")}
                  />
                </View>
              </Row>
            }
          />
        </View>
      ))}
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space(3) },
  thumb: { width: 84, height: 84, borderRadius: radius.sm },
  caption: { width: 84, fontSize: 11, marginTop: 2 },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: space(4),
  },
  modalImg: { width: "100%", height: "80%" },
});
