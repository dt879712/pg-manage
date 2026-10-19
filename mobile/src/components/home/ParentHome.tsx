import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { Badge, Button, Card, ErrorText, Hero, Muted, Row, Skeleton, SkeletonRows, statusTone } from "@/components/ui";
import { AnnouncementsCard, TenantBanner } from "@/components/branding";
import { money, shortDate, timeOf, greeting } from "@/lib/format";
import { space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Attendance, Invoice, StatusVideo, TenantBranding } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useRefreshOnFocus } from "@/lib/useRefreshOnFocus";

export function ParentHome({ name }: { name: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const tenant = useApi<{ tenant: TenantBranding }>("/tenant");
  const att = useApi<{ records: Attendance[] }>("/attendance?take=1");
  const invoices = useApi<{ invoices: Invoice[] }>("/invoices?take=20");

  useRefreshOnFocus(tenant.reload);
  useRefreshOnFocus(att.reload);
  useRefreshOnFocus(invoices.reload);

  const pgName = tenant.data?.tenant?.name ?? "Your PG";

  const latest = att.data?.records?.[0];
  const isIn = latest?.type === "CHECK_IN";
  const list = invoices.data?.invoices ?? [];
  const due = list
    .filter((i) => i.status === "PENDING" || i.status === "PARTIAL")
    .reduce((sum, i) => sum + (i.amount - (i.payments ?? []).reduce((s, p) => s + p.amount, 0)), 0);

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }}>
      <View>
        <Hero
          eyebrow={greeting()}
          title={name}
          subtitle={`${pgName} · Your child's activity`}
        />
      </View>
      <TenantBanner />
      <ErrorText>{att.error || invoices.error}</ErrorText>

      <Card style={{ gap: space(2), alignItems: "center" }}>
        {att.loading ? <Skeleton width={120} height={120} radius={60} /> : null}
        {!att.loading ? (
          <>
            <Text style={{ fontSize: 36 }}>{isIn ? "🟢" : "⚪"}</Text>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text }}>
              {latest ? (isIn ? "In PG" : "Checked out") : "No activity yet"}
            </Text>
            {latest ? <Muted>{timeOf(latest.at)}</Muted> : null}
          </>
        ) : null}
      </Card>

      <Card style={{ gap: space(3) }}>
        <Row between>
          <Text style={{ fontWeight: "700", color: colors.text }}>Fees</Text>
          <Muted>Due {invoices.loading ? "…" : money(due)}</Muted>
        </Row>
        {invoices.loading ? <SkeletonRows count={4} /> : null}
        {!invoices.loading &&
          list.slice(0, 6).map((inv) => (
            <Row key={inv.id} between>
              <View>
                <Text style={{ color: colors.text, fontWeight: "600" }}>{inv.title}</Text>
                <Muted>
                  {money(inv.amount)} · {shortDate(inv.createdAt)}
                </Muted>
              </View>
              <Badge label={inv.status} tone={statusTone(inv.status)} />
            </Row>
          ))}
        {!invoices.loading && list.length === 0 ? <Muted>No invoices yet</Muted> : null}
      </Card>
      <LatestVideoCard />
      <Row style={{ gap: space(3) }}>
        <View style={{ flex: 1 }}>
          <Button label="Messages" variant="ghost" icon="chatbubbles-outline" onPress={() => router.push("/messages")} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Rules" variant="ghost" icon="book-outline" onPress={() => router.push("/rules")} />
        </View>
      </Row>
      <AnnouncementsCard />
    </ScrollView>
  );
}

const RING_SIZE = 208;

function LatestVideoCard() {
  const { colors } = useTheme();
  const videos = useApi<{ videos: StatusVideo[] }>("/status-videos");
  useRefreshOnFocus(videos.reload);

  // Keep the screen current: a fresh clip should appear on its own, no pull-to-refresh.
  const { reload } = videos;
  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(reload, 10000);
      return () => clearInterval(timer);
    }, [reload])
  );

  const video = videos.data?.videos?.[0];
  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
    p.muted = true;
  });

  const [muted, setMuted] = useState(true);
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      player.muted = next;
      return next;
    });
  }, [player]);

  // The signed URL changes on every poll, so only swap the source when the clip itself changes.
  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    if (!video?.url) {
      loadedId.current = null;
      return;
    }
    if (loadedId.current === video.id) return;
    loadedId.current = video.id;
    player
      .replaceAsync(video.url)
      .then(() => player.play())
      .catch(() => {});
  }, [video?.id, video?.url, player]);

  const isIn = video?.direction === "CHECK_IN";
  const ring = isIn ? colors.success : colors.danger;
  const name = video?.student
    ? [video.student.firstName, video.student.lastName].filter(Boolean).join(" ")
    : "";

  return (
    <Card style={{ gap: space(3), alignItems: "center" }}>
      <Row between style={{ width: "100%" }}>
        <Text style={{ fontWeight: "700", color: colors.text }}>Check-in video</Text>
        {video ? (
          <Badge label={isIn ? "In" : "Out"} tone={isIn ? "success" : "warning"} />
        ) : null}
      </Row>
      <ErrorText>{videos.error}</ErrorText>
      {videos.loading && !video ? <Skeleton width={RING_SIZE} height={RING_SIZE} radius={RING_SIZE / 2} /> : null}

      {!videos.loading || video ? (
        <View style={{ width: RING_SIZE, height: RING_SIZE }}>
          <View
            style={{
              width: RING_SIZE,
              height: RING_SIZE,
              borderRadius: RING_SIZE / 2,
              borderWidth: 4,
              borderColor: video ? ring : colors.border,
              overflow: "hidden",
              backgroundColor: "#000",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {video?.url ? (
              <VideoView
                player={player}
                style={{ width: RING_SIZE, height: RING_SIZE }}
                contentFit="cover"
                nativeControls={false}
                surfaceType="textureView"
              />
            ) : (
              <View style={{ alignItems: "center", gap: space(2) }}>
                <Ionicons name="videocam-off-outline" color={colors.muted} size={34} />
                <Muted style={{ fontSize: 12 }}>No video yet</Muted>
              </View>
            )}
          </View>
          {video?.url ? (
            <Pressable
              onPress={toggleMute}
              hitSlop={8}
              style={{
                position: "absolute",
                right: 4,
                bottom: 4,
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "rgba(0,0,0,0.65)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.25)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={muted ? "volume-mute" : "volume-high"} color="#fff" size={20} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!videos.loading && video ? (
        <View style={{ alignItems: "center", gap: 2 }}>
          <Text style={{ fontWeight: "700", color: colors.text }}>
            {isIn ? "Checked in" : "Checked out"}
            {name ? ` · ${name}` : ""}
          </Text>
          <Muted style={{ fontSize: 12 }}>
            {video.student?.room?.roomNumber ? `Room ${video.student.room.roomNumber} · ` : ""}
            {timeOf(video.createdAt)}
          </Muted>
        </View>
      ) : null}
      {!videos.loading && video && !video.url ? (
        <Muted>Video is not available right now.</Muted>
      ) : null}
    </Card>
  );
}
