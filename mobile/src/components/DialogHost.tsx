import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui";
import { setDialogHandler, type DialogRequest } from "@/lib/dialog";
import { radius, shadow, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

export function DialogHost() {
  const { colors } = useTheme();
  const [request, setRequest] = useState<DialogRequest | null>(null);

  useEffect(() => {
    setDialogHandler(setRequest);
    return () => setDialogHandler(null);
  }, []);

  const cancel = () => {
    if (request?.kind === "confirm") request.resolve(false);
    setRequest(null);
  };
  const accept = () => {
    if (request?.kind === "confirm") request.resolve(true);
    setRequest(null);
  };

  return (
    <Modal transparent visible={request !== null} animationType="fade" onRequestClose={cancel}>
      <Pressable style={styles.backdrop} onPress={cancel}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.card, shadow.md, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={[styles.title, { color: colors.text }]}>{request?.title ?? ""}</Text>
          {request?.message ? (
            <Text style={[styles.message, { color: colors.muted }]}>{request.message}</Text>
          ) : null}
          <View style={styles.actions}>
            {request?.kind === "confirm" ? (
              <Button label="Cancel" variant="ghost" block onPress={cancel} />
            ) : null}
            <Button
              label={request?.kind === "confirm" ? request.confirmLabel : "OK"}
              variant={request?.kind === "confirm" && request.destructive ? "danger" : "primary"}
              block
              onPress={accept}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: space(5),
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space(5),
    gap: space(3),
  },
  title: { fontSize: 18, fontWeight: "700" },
  message: { fontSize: 14, lineHeight: 20 },
  actions: { gap: space(2), marginTop: space(1) },
});
