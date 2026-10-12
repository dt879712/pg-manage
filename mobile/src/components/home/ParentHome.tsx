import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { Badge, Button, Card, ErrorText, Hero, Muted, Row, Skeleton, SkeletonRows, statusTone } from "@/components/ui";
import { AnnouncementsCard, TenantBanner } from "@/components/branding";
import { money, shortDate, timeOf, greeting } from "@/lib/format";
import { radius, space } from "@/lib/theme";
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
          <Button label="Message owner" variant="ghost" icon="chatbubble-outline" onPress={() => router.push("/message/new")} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="My messages" variant="ghost" icon="chatbubbles-outline" onPress={() => router.push("/messages")} />
        </View>
      </Row>
      <AnnouncementsCard />
    </ScrollView>
  );
}

function LatestVideoCard() {
  const { colors } = useTheme();
  const videos = useApi<{ videos: StatusVideo[] }>("/status-videos");
  useRefreshOnFocus(videos.reload);

  const video = videos.data?.videos?.[0];
  const player = useVideoPlayer(video?.url ?? null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <Card style={{ gap: space(2) }}>
      <Row between>
        <Text style={{ fontWeight: "700", color: colors.text }}>Latest check-in video</Text>
        {video ? (
          <Badge
            label={video.direction === "CHECK_IN" ? "In" : "Out"}
            tone={video.direction === "CHECK_IN" ? "success" : "warning"}
          />
        ) : null}
      </Row>
      <ErrorText>{videos.error}</ErrorText>
      {videos.loading ? <Skeleton height={240} /> : null}
      {!videos.loading && !video ? <Muted>No check-in video yet.</Muted> : null}
      {!videos.loading && video?.url ? (
        <>
          <VideoView
            player={player}
            style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: radius.lg, backgroundColor: "#000" }}
            contentFit="contain"
            surfaceType="textureView"
          />
          <Muted style={{ fontSize: 12 }}>
            {video.direction === "CHECK_IN" ? "Checked in" : "Checked out"} · {timeOf(video.createdAt)}
          </Muted>
        </>
      ) : null}
      {!videos.loading && video && !video.url ? (
        <Muted>Video is not available right now.</Muted>
      ) : null}
    </Card>
  );
}
