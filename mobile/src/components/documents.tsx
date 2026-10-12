import { useState } from "react";
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Muted } from "@/components/ui";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { DocumentFile } from "@/lib/types";

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
}: {
  documents: DocumentFile[];
  onAdd: () => void;
  onDelete?: (doc: DocumentFile) => void;
  busy?: boolean;
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
            </Text>
          </Pressable>
        ))}
        {documents.length === 0 ? <Muted>No documents uploaded</Muted> : null}
      </View>
      <Button label="Add document" variant="ghost" loading={busy} onPress={onAdd} />
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.modalBg} onPress={() => setViewing(null)}>
          {viewing ? <Image source={{ uri: viewing }} style={styles.modalImg} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </View>
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
