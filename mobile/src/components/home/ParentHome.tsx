import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Badge, Button, Card, ErrorText, Hero, Muted, Row, Skeleton, SkeletonRows, statusTone } from "@/components/ui";
import { AnnouncementsCard, TenantBanner } from "@/components/branding";
import { money, shortDate, timeOf, greeting } from "@/lib/format";
import { space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Attendance, Invoice, TenantBranding } from "@/lib/types";
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
      <Row style={{ gap: space(3) }}>
        <View style={{ flex: 1 }}>
          <Button label="Check-in videos" icon="videocam-outline" onPress={() => router.push("/status-videos")} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Message owner" variant="ghost" icon="chatbubble-outline" onPress={() => router.push("/message/new")} />
        </View>
      </Row>
      <Button label="My messages" variant="ghost" onPress={() => router.push("/messages")} />
      <AnnouncementsCard />
    </ScrollView>
  );
}
