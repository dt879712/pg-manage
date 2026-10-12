import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorText,
  Loading,
  Muted,
  Row,
  rowCard,
} from "@/components/ui";
import { DesktopShell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { StatusVideo } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useRefreshOnFocus } from "@/lib/useRefreshOnFocus";

function studentName(v: StatusVideo): string {
  const s = v.student;
  if (!s) return "Student";
  return [s.firstName, s.lastName].filter(Boolean).join(" ");
}

function VideosView() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.role;
  const canRecord = role === "OWNER" || role === "STAFF" || role === "GUARD" || role === "STUDENT";
  const isStaff = role === "OWNER" || role === "STAFF" || role === "GUARD";

  const { data, loading, error, reload } = useApi<{ videos: StatusVideo[] }>("/status-videos");
  useRefreshOnFocus(reload);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<StatusVideo | null>(null);

  const videos = useMemo(() => {
    const list = data?.videos ?? [];
    if (!q.trim()) return list;
    const needle = q.trim().toLowerCase();
    return list.filter((v) => studentName(v).toLowerCase().includes(needle));
  }, [data, q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: space(4), gap: space(2), width: "100%", maxWidth: 720, alignSelf: "center" }}>
        <Row between>
          <Muted>{videos.length} video(s)</Muted>
          {canRecord ? (
            <Button label="Record" icon="videocam-outline" size="sm" onPress={() => router.push("/status-video/record")} />
          ) : null}
        </Row>
        <Muted style={{ fontSize: 12 }}>
          The latest 15-second check-in/out clip for each student is kept. The previous clip is deleted automatically.
        </Muted>
        {isStaff ? (
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search student by name"
            placeholderTextColor={colors.muted}
            style={[inputStyle, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]}
          />
        ) : null}
        <ErrorText>{error}</ErrorText>
      </View>

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(v) => v.id}
          refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
          contentContainerStyle={{
            paddingHorizontal: space(4),
            paddingBottom: space(4),
            gap: space(3),
            width: "100%",
            maxWidth: 720,
            alignSelf: "center",
          }}
          ListEmptyComponent={
            <Empty text="No check-in videos yet" icon="videocam-off-outline" />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setOpen(item)}
              style={({ pressed }) => [rowCard(colors.card, colors.border), { opacity: pressed ? 0.85 : 1 }]}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radius.md,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.cardAlt,
                }}
              >
                <Text style={{ fontSize: 20 }}>{item.direction === "CHECK_IN" ? "🟢" : "🔴"}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontWeight: "700", color: colors.text, fontSize: 15 }}>
                  {studentName(item)}
                </Text>
                <Muted numberOfLines={1} style={{ fontSize: 12 }}>
                  {item.student?.room?.roomNumber ? `Room ${item.student.room.roomNumber} · ` : ""}
                  {timeAgo(item.createdAt)}
                </Muted>
              </View>
              <Badge
                label={item.direction === "CHECK_IN" ? "In" : "Out"}
                tone={item.direction === "CHECK_IN" ? "success" : "warning"}
              />
            </Pressable>
          )}
        />
      )}

      {open ? <VideoModal video={open} onClose={() => setOpen(null)} /> : null}
    </View>
  );
}

function VideoModal({ video, onClose }: { video: StatusVideo; onClose: () => void }) {
  const { colors } = useTheme();
  const player = useVideoPlayer(video.url, (p) => {
    p.loop = true;
    p.muted = true; p.play();
  });

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ padding: space(4), gap: space(2), maxWidth: 720, width: "100%", alignSelf: "center" }}>
          <Row between>
            <Text style={{ fontWeight: "800", fontSize: 18, color: colors.text }}>
              {studentName(video)}
            </Text>
            <Button label="Close" variant="ghost" size="sm" onPress={onClose} />
          </Row>
          <Muted>
            {video.direction === "CHECK_IN" ? "Checked in" : "Checked out"} · {timeAgo(video.createdAt)}
          </Muted>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space(3) }}>
          {video.url ? (
            <VideoView
              player={player}
              style={{ width: "100%", maxWidth: 420, aspectRatio: 3 / 4, borderRadius: radius.lg }}
              contentFit="contain"
              surfaceType="textureView"
            />
          ) : (
            <Card>
              <Text style={{ color: colors.text }}>Video not available.</Text>
            </Card>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function StatusVideos() {
  return (
    <DesktopShell>
      <VideosView />
    </DesktopShell>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderRadius: radius.sm,
  paddingHorizontal: space(3),
  paddingVertical: space(3),
  fontSize: 15,
};
