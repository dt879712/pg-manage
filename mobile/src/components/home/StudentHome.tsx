import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, ErrorText, Hero, Muted, Row, Skeleton } from "@/components/ui";
import { AnnouncementsCard, TenantBanner } from "@/components/branding";
import { greeting, timeOf } from "@/lib/format";
import { space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Attendance } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useRefreshOnFocus } from "@/lib/useRefreshOnFocus";

export function StudentHome({ name }: { name: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const att = useApi<{ records: Attendance[] }>("/attendance?take=1");
  useRefreshOnFocus(att.reload);

  const latest = att.data?.records?.[0];
  const isIn = latest?.type === "CHECK_IN";

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }}>
      <View>
        <Hero eyebrow={greeting()} title={name} subtitle="Your attendance for today" />
      </View>
      <TenantBanner />
      <ErrorText>{att.error}</ErrorText>

      <Card style={{ gap: space(3), alignItems: "center" }}>
        {att.loading ? <Skeleton width={120} height={120} radius={60} /> : null}
        {!att.loading ? (
          <>
            <Text style={{ fontSize: 40 }}>{isIn ? "🟢" : "⚪"}</Text>
            {latest ? (
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  color: isIn ? colors.success : colors.muted,
                }}
              >
                {isIn ? "Currently IN" : "Currently OUT"}
              </Text>
            ) : (
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
                No check-ins yet
              </Text>
            )}
            {latest ? <Muted>Last update · {timeOf(latest.at)}</Muted> : null}
          </>
        ) : null}
      </Card>

      <Card style={{ gap: space(2) }}>
        <Text style={{ fontWeight: "700", color: colors.text }}>Check-in/out videos</Text>
        <Muted>
          The gate guard records a 15-second video when you enter or leave the PG. Your parents can
          watch it too. The previous clip is replaced automatically.
        </Muted>
      </Card>

      <Row style={{ gap: space(3) }}>
        <View style={{ flex: 1 }}>
          <Button label="My videos" icon="videocam-outline" variant="ghost" onPress={() => router.push("/status-videos")} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Message owner" icon="chatbubble-outline" variant="ghost" onPress={() => router.push("/message/new")} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Rules" icon="book-outline" variant="ghost" onPress={() => router.push("/rules")} />
        </View>
      </Row>
      <AnnouncementsCard />
    </ScrollView>
  );
}
