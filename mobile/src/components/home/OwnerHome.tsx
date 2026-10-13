import { useRouter } from "expo-router";
import { Platform, ScrollView, Text, View } from "react-native";
import {
  Badge,
  Card,
  ErrorText,
  Hero,
  Muted,
  QuickAction,
  Row,
  SectionTitle,
  SkeletonRows,
  Stat,
  statusTone,
} from "@/components/ui";
import { AnnouncementsCard, TenantBanner } from "@/components/branding";
import { useAuth } from "@/lib/auth";
import { greeting, money, shortDate } from "@/lib/format";
import { space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Invoice, Room, Student } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useRefreshOnFocus } from "@/lib/useRefreshOnFocus";

export function OwnerHome() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const rooms = useApi<{ rooms: Room[] }>("/rooms");
  const students = useApi<{ students: Student[]; total: number }>("/students?take=1");
  const invoices = useApi<{ invoices: Invoice[]; total: number }>("/invoices?take=50");

  useRefreshOnFocus(rooms.reload);
  useRefreshOnFocus(students.reload);
  useRefreshOnFocus(invoices.reload);

  const loading = rooms.loading || students.loading || invoices.loading;

  const roomList = rooms.data?.rooms ?? [];
  const beds = roomList.flatMap((r) => r.beds ?? []);
  const occupied = beds.filter((b) => b.status === "OCCUPIED").length;
  const list = invoices.data?.invoices ?? [];
  const pending = list.filter((i) => i.status === "PENDING" || i.status === "PARTIAL");
  const due = pending.reduce(
    (sum, i) => sum + (i.amount - (i.payments ?? []).reduce((s, p) => s + p.amount, 0)),
    0
  );

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }}>
      <Hero
        eyebrow={`${greeting()}, ${user?.name?.split(" ")[0] ?? "Owner"}`}
        title={user?.name ? `${user.name}'s PG` : "Your PG"}
        subtitle={new Date().toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      />

      <TenantBanner />
      <AnnouncementsCard />

      <ErrorText>{rooms.error || students.error || invoices.error}</ErrorText>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(3) }}>
        <QuickAction label="Add student" icon="person-add-outline" onPress={() => router.push("/student/new")} />
        <QuickAction label="Send notice" icon="notifications-outline" onPress={() => router.push("/notify")} />
        <QuickAction label="Manage PG" icon="storefront-outline" onPress={() => router.push("/settings")} />
        <QuickAction label="Accounts" icon="id-card-outline" onPress={() => router.push("/(tabs)/users")} />
        <QuickAction label="Messages" icon="chatbubbles-outline" onPress={() => router.push("/messages")} />
        <QuickAction label="Check-in videos" icon="videocam-outline" onPress={() => router.push("/status-videos")} />
        {Platform.OS !== "web" ? (
          <>
            <QuickAction label="Admissions" icon="document-text-outline" onPress={() => router.push("/(tabs)/admissions")} />
            <QuickAction label="Leaves" icon="calendar-outline" onPress={() => router.push("/(tabs)/leaves")} />
          </>
        ) : null}
      </View>

      <View>
        <SectionTitle>Overview</SectionTitle>
        <Row style={{ gap: space(3), marginTop: space(3) }}>
          <Stat label="Active students" value={loading ? "—" : students.data?.total ?? 0} />
          <Stat label="Rooms" value={loading ? "—" : roomList.length} tone="warning" />
        </Row>
        <Row style={{ gap: space(3), marginTop: space(3) }}>
          <Stat label="Beds available" value={loading ? "—" : beds.length - occupied} tone="success" />
          <Stat label="Dues pending" value={loading ? "—" : money(due)} tone="danger" />
        </Row>
      </View>

      <Card style={{ gap: space(3) }}>
        <Row between>
          <SectionTitle>Recent invoices</SectionTitle>
          {!loading ? <Muted>{invoices.data?.total ?? 0} total</Muted> : null}
        </Row>
        {loading ? <SkeletonRows count={5} /> : null}
        {!loading &&
          list.slice(0, 5).map((inv) => (
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
        {!loading && list.length === 0 ? <Muted>No invoices yet</Muted> : null}
      </Card>
    </ScrollView>
  );
}