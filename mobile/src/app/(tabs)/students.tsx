import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Badge, Button, Empty, ErrorText, Loading, Muted, rowCard, statusTone } from "@/components/ui";
import { DesktopShell } from "@/components/shell";
import { fullName, money } from "@/lib/format";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Student } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useRefreshOnFocus } from "@/lib/useRefreshOnFocus";

function StudentsView() {
  const { colors } = useTheme();
  const router = useRouter();
  const [q, setQ] = useState("");
  const trimmed = q.trim();
  const path = trimmed ? `/students?q=${encodeURIComponent(trimmed)}` : "/students";
  const { data, loading, error, reload } = useApi<{ students: Student[]; total: number }>(path);
  useRefreshOnFocus(reload);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          padding: space(4),
          gap: space(3),
          width: "100%",
          maxWidth: 720,
          alignSelf: "center",
        }}
      >
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search students"
          placeholderTextColor={colors.muted}
          style={[inputStyle, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]}
        />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Muted>{data?.total ?? 0} active record(s)</Muted>
          <Button
            label="Add student"
            icon="add"
            size="sm"
            onPress={() => router.push("/student/new")}
          />
        </View>
        <ErrorText>{error}</ErrorText>
      </View>
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={data?.students ?? []}
          keyExtractor={(s) => s.id}
          refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
          contentContainerStyle={{
            paddingHorizontal: space(4),
            paddingBottom: space(4),
            gap: space(3),
            width: "100%",
            maxWidth: 720,
            alignSelf: "center",
          }}
          ListEmptyComponent={<Empty text="No students yet" />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: "/student/[id]", params: { id: item.id } })}
              style={({ pressed }) => [
                rowCard(colors.card, colors.border),
                { opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontWeight: "700", color: colors.text, fontSize: 15 }}>
                  {fullName(item.firstName, item.lastName)}
                </Text>
                <Muted numberOfLines={1}>
                  {item.room?.roomNumber ? `Room ${item.room.roomNumber}` : "No room"}
                  {item.monthlyFee != null ? ` · ${money(item.monthlyFee)}/mo` : ""}
                </Muted>
              </View>
              {item.phone ? (
                <View style={{ minWidth: 118 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13, color: colors.muted }}>
                    {item.phone}
                  </Text>
                </View>
              ) : null}
              <Badge label={item.status} tone={statusTone(item.status)} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

export default function Students() {
  return (
    <DesktopShell>
      <StudentsView />
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
