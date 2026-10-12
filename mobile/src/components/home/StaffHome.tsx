import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { greeting, timeOf } from "@/lib/format";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import { useAuth } from "@/lib/auth";
import type { Attendance, RosterStudent } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { Button, Card, Empty, ErrorText, Hero, Loading, Muted, Row } from "@/components/ui";
import { AnnouncementsCard, TenantBanner } from "@/components/branding";

export function StaffHome({ name }: { name: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const isGuard = user?.role === "GUARD";
  const roster = useApi<{ students: RosterStudent[] }>("/attendance/roster");
  const attendance = useApi<{ records: Attendance[] }>("/attendance?take=10");
  const [q, setQ] = useState("");

  const students = (roster.data?.students ?? []).filter((s) =>
    s.firstName.toLowerCase().includes(q.trim().toLowerCase())
  );

  const record = (s: RosterStudent, direction: "CHECK_IN" | "CHECK_OUT") =>
    router.push({
      pathname: "/status-video/record",
      params: { studentId: s.id, direction, name: s.firstName, room: s.room?.roomNumber ?? "" },
    });

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), gap: space(4) }}>
      <View>
        <Hero
          eyebrow={greeting()}
          title={name}
          subtitle={isGuard ? "Gate · Record student in/out" : "Front desk · Record check-in/out videos"}
        />
      </View>

      <TenantBanner />
      <AnnouncementsCard />

      <Row style={{ gap: space(3) }}>
        <View style={{ flex: 1 }}>
          <Button label="Check-in videos" icon="videocam-outline" onPress={() => router.push("/status-videos")} />
        </View>
        {!isGuard ? (
          <View style={{ flex: 1 }}>
            <Button label="Messages" variant="ghost" icon="chatbubbles-outline" onPress={() => router.push("/messages")} />
          </View>
        ) : null}
      </Row>

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search student by name"
        placeholderTextColor={colors.muted}
        style={[inputStyle, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]}
      />

      <ErrorText>{roster.error}</ErrorText>

      <Card style={{ gap: space(3) }}>
        <Text style={{ fontWeight: "700", color: colors.text }}>Students ({students.length})</Text>
        {roster.loading ? <Loading /> : null}
        {!roster.loading && students.length === 0 ? <Empty text="No matching students" /> : null}
        {students.map((s) => {
          const isIn = s.currentStatus === "CHECK_IN";
          return (
            <Row key={s.id} between style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space(3) }}>
              <View style={{ gap: space(1) }}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>{s.firstName}</Text>
                <Muted>{s.room?.roomNumber ? `Room ${s.room.roomNumber}` : "No room"}</Muted>
                <Row style={{ gap: 6 }}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: s.currentStatus === "NONE" ? colors.muted : isIn ? colors.success : colors.muted,
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "800",
                      color: s.currentStatus === "NONE" ? colors.muted : isIn ? colors.success : colors.muted,
                    }}
                  >
                    {s.currentStatus === "NONE" ? "NO ACTIVITY" : isIn ? "IN" : "OUT"}
                  </Text>
                </Row>
              </View>
              <Row style={{ gap: space(2) }}>
                <Button
                  label="In"
                  icon="videocam-outline"
                  variant={isIn ? "ghost" : "success"}
                  disabled={isIn}
                  onPress={() => record(s, "CHECK_IN")}
                />
                <Button
                  label="Out"
                  icon="videocam-outline"
                  variant={isIn ? "success" : "ghost"}
                  disabled={!isIn}
                  onPress={() => record(s, "CHECK_OUT")}
                />
              </Row>
            </Row>
          );
        })}
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={{ fontWeight: "700", color: colors.text }}>Recent activity</Text>
        {(attendance.data?.records ?? []).map((a) => (
          <Row key={a.id} between>
            <Text style={{ color: colors.text, fontWeight: "600" }}>{a.student?.firstName ?? "Student"}</Text>
            <Muted>
              {a.type === "CHECK_IN" ? "In" : "Out"} · {timeOf(a.at)}
            </Muted>
          </Row>
        ))}
        {(attendance.data?.records ?? []).length === 0 ? <Muted>No records yet</Muted> : null}
      </Card>
    </ScrollView>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderRadius: radius.sm,
  paddingHorizontal: space(3),
  paddingVertical: space(3),
  fontSize: 15,
};
