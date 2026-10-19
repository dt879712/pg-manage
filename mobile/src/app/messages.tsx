import { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
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
import { TopBar } from "@/components/topbar";
import { useAuth } from "@/lib/auth";
import { markMessageRead, replyMessage } from "@/lib/endpoints";
import { expiresIn, shortDate, timeAgo, timeOf } from "@/lib/format";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";
import type { Message } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useRefreshOnFocus } from "@/lib/useRefreshOnFocus";

function senderName(m: Message): string {
  return m.sender?.name ?? "Unknown sender";
}

function senderContext(m: Message): string {
  const s = m.sender;
  if (!s) return "";
  if (s.studentProfile) {
    const room = s.studentProfile.room?.roomNumber;
    return `Student${room ? ` \u00b7 Room ${room}` : ""}`;
  }
  if (s.parentLinks && s.parentLinks.length) {
    const kids = s.parentLinks.map((l) => l.student.firstName).join(", ");
    return `Parent of ${kids}`;
  }
  return s.role;
}

function MessagesView() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.role;
  const isInbox = role === "OWNER" || role === "STAFF";
  const canSend = role === "STAFF";
  const { data, loading, error, reload } = useApi<{
    messages: Message[];
    total: number;
    unread: number;
  }>("/messages");
  useRefreshOnFocus(reload);
  const [openId, setOpenId] = useState<string | null>(null);

  const unread = isInbox ? data?.unread ?? 0 : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          padding: space(4),
          gap: space(2),
          width: "100%",
          maxWidth: 720,
          alignSelf: "center",
        }}
      >
        <Row between>
          <Muted>
            {data?.messages.length ?? 0} message(s)
            {unread > 0 ? ` \u00b7 ${unread} unread` : ""}
          </Muted>
          {canSend ? (
            <Button label="New message" icon="add" onPress={() => router.push("/message/new")} />
          ) : null}
        </Row>
        <Muted style={{ fontSize: 12 }}>
          {isInbox
            ? "Messages from parents, students and staff are kept for 48 hours, then deleted automatically."
            : "Messages are sent to the PG owner and kept for 48 hours, then deleted automatically."}
        </Muted>
        <ErrorText>{error}</ErrorText>
      </View>

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={data?.messages ?? []}
          keyExtractor={(m) => m.id}
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
            <Empty
              text={
                isInbox
                  ? "No messages in the last 48 hours"
                  : "You haven't sent any messages yet"
              }
              icon="chatbubble-ellipses-outline"
            />
          }
          renderItem={({ item }) => {
            const unreadItem = isInbox && !item.readAt;
            return (
              <Pressable
                onPress={() => setOpenId(item.id)}
                style={({ pressed }) => [
                  rowCard(colors.card, colors.border),
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  {isInbox ? (
                    <Text
                      numberOfLines={1}
                      style={{ fontWeight: "700", color: colors.text, fontSize: 15 }}
                    >
                      {senderName(item)}
                    </Text>
                  ) : null}
                  <Text
                    numberOfLines={1}
                    style={{
                      fontWeight: isInbox ? "500" : "700",
                      color: colors.text,
                      fontSize: isInbox ? 14 : 15,
                    }}
                  >
                    {item.subject?.trim() ? item.subject : item.body}
                  </Text>
                  <Muted numberOfLines={1} style={{ fontSize: 12 }}>
                    {isInbox ? senderContext(item) : item.replyToId ? "From the PG" : "To owner"}
                    {" \u00b7 "}
                    {timeAgo(item.createdAt)}
                  </Muted>
                </View>
                {unreadItem ? (
                  <Badge label="New" tone="primary" />
                ) : !isInbox ? (
                  <Badge
                    label={item._count?.replies ? "Replied" : "No reply"}
                    tone={item._count?.replies ? "success" : "neutral"}
                  />
                ) : null}
              </Pressable>
            );
          }}
        />
      )}

      {openId ? (
        <MessageDetail
          id={openId}
          isInbox={isInbox}
          onClose={() => setOpenId(null)}
          onChanged={reload}
        />
      ) : null}
    </View>
  );
}

function MessageDetail({
  id,
  isInbox,
  onClose,
  onChanged,
}: {
  id: string;
  isInbox: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { colors } = useTheme();
  const { data, loading, error } = useApi<{ message: Message }>(`/messages/${id}`);
  const message = data?.message;
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [replyErr, setReplyErr] = useState<string | null>(null);

  const markRead = async () => {
    try {
      await markMessageRead(id);
      onChanged();
    } catch {
      /* ignore */
    }
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text) return;
    setSending(true);
    setReplyErr(null);
    try {
      await replyMessage(id, text);
      if (!message?.readAt) {
        try {
          await markMessageRead(id);
        } catch {
          /* ignore */
        }
      }
      setReply("");
      onChanged();
      onClose();
    } catch (e) {
      setReplyErr(e instanceof Error ? e.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{
          padding: space(4),
          gap: space(4),
          paddingBottom: space(12),
          alignItems: "center",
        }}
      >
        <View style={{ width: "100%", maxWidth: 560, gap: space(4) }}>
          {loading ? (
            <Loading />
          ) : error || !message ? (
            <>
              <ErrorText>{error ?? "Not found"}</ErrorText>
              <Button label="Close" variant="ghost" onPress={onClose} />
            </>
          ) : (
            <>
              <Card style={{ gap: space(2) }}>
                <Row between>
                  <Text style={{ fontWeight: "800", fontSize: 18, color: colors.text, flex: 1 }}>
                    {isInbox ? senderName(message) : message.subject?.trim() || "Message"}
                  </Text>
                  {isInbox ? (
                    message.readAt ? (
                      <Badge label="Read" tone="success" />
                    ) : (
                      <Badge label="New" tone="primary" />
                    )
                  ) : (
                    <Badge
                      label={message._count?.replies ? "Replied" : "No reply"}
                      tone={message._count?.replies ? "success" : "neutral"}
                    />
                  )}
                </Row>
                {isInbox ? <Muted>{senderContext(message)}</Muted> : null}

                {isInbox && message.sender ? (
                  <>
                    {message.sender.email ? (
                      <Detail label="Email" value={message.sender.email} />
                    ) : null}
                    {message.sender.phone ? (
                      <Detail label="Phone" value={message.sender.phone} />
                    ) : null}
                    {message.sender.studentProfile?.room ? (
                      <Detail label="Room" value={message.sender.studentProfile.room.roomNumber} />
                    ) : null}
                  </>
                ) : null}

                {isInbox && message.sender?.parentLinks?.length ? (
                  <Detail
                    label="Children"
                    value={message.sender.parentLinks
                      .map((l) => {
                        const room = l.student.room?.roomNumber;
                        return `${l.student.firstName}${room ? ` (Room ${room})` : ""}`;
                      })
                      .join(", ")}
                  />
                ) : null}

                {message.subject?.trim() ? (
                  <Detail label="Subject" value={message.subject} />
                ) : null}
                <Detail
                  label="Sent"
                  value={`${shortDate(message.createdAt)} \u00b7 ${timeOf(message.createdAt)}`}
                />
                <Detail label="Expires" value={expiresIn(message.createdAt)} />
              </Card>

              <Card style={{ gap: space(2) }}>
                <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>
                  {message.body}
                </Text>
              </Card>

              {isInbox ? (
                <Card style={{ gap: space(3) }}>
                  <Text style={{ fontWeight: "700", color: colors.text }}>Reply</Text>
                  <TextInput
                    value={reply}
                    onChangeText={setReply}
                    placeholder={`Write a reply to ${senderName(message)}`}
                    placeholderTextColor={colors.muted}
                    multiline
                    style={{
                      minHeight: 90,
                      textAlignVertical: "top",
                      borderWidth: 1,
                      borderRadius: radius.sm,
                      borderColor: colors.border,
                      backgroundColor: colors.bg,
                      color: colors.text,
                      paddingHorizontal: space(3),
                      paddingVertical: space(3),
                      fontSize: 15,
                    }}
                  />
                  <ErrorText>{replyErr}</ErrorText>
                  <Button
                    label="Send reply"
                    icon="send"
                    loading={sending}
                    disabled={reply.trim().length === 0}
                    onPress={sendReply}
                  />
                </Card>
              ) : null}

              <Row style={{ gap: space(3) }}>
                {isInbox && !message.readAt ? (
                  <Button label="Mark as read" onPress={markRead} />
                ) : null}
                <Button label="Close" variant="ghost" onPress={onClose} />
              </Row>
            </>
          )}
        </View>
      </ScrollView>
      </View>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: space(2), alignItems: "flex-start" }}>
      <Text style={{ color: colors.muted, fontSize: 13, width: 92 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{value}</Text>
    </View>
  );
}

export default function Messages() {
  return (
    <DesktopShell>
      <MessagesView />
    </DesktopShell>
  );
}
