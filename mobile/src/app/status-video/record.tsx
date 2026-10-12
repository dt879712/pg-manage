import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, ErrorText, Muted, Row } from "@/components/ui";
import {
  uploadStatusVideo,
  type StatusDirection,
} from "@/lib/endpoints";
import { radius, space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

const MAX_SECONDS = 15;

type Stage = "idle" | "recording" | "uploading" | "done";

export default function RecordStatusVideo() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    studentId?: string;
    direction?: string;
    name?: string;
    room?: string;
  }>();

  const studentId = params.studentId || undefined;
  const targetName = params.name || "yourself";
  const initialDirection =
    params.direction === "CHECK_IN" || params.direction === "CHECK_OUT"
      ? (params.direction as StatusDirection)
      : null;

  const [direction, setDirection] = useState<StatusDirection | null>(initialDirection);
  const [facing, setFacing] = useState<"front" | "back">("front");
  const [stage, setStage] = useState<Stage>("idle");
  const [seconds, setSeconds] = useState(MAX_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();

  useEffect(() => {
    if (camPerm && !camPerm.granted && camPerm.canAskAgain) void requestCam();
    if (micPerm && !micPerm.granted && micPerm.canAskAgain) void requestMic();
  }, [camPerm, micPerm, requestCam, requestMic]);

  useEffect(() => {
    if (stage !== "recording") return;
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [stage]);

  useEffect(() => {
    if (stage === "recording" && seconds === 0) cameraRef.current?.stopRecording();
  }, [stage, seconds]);

  const upload = async (uri: string, dir: StatusDirection) => {
    setStage("uploading");
    try {
      await uploadStatusVideo({ uri, studentId, direction: dir, mimeType: "video/mp4" });
      setStage("done");
      setTimeout(() => router.back(), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setStage("idle");
    }
  };

  const start = async (dir: StatusDirection) => {
    setError(null);
    setSeconds(MAX_SECONDS);
    setStage("recording");
    try {
      const result = await cameraRef.current?.recordAsync({
        maxDuration: MAX_SECONDS,
      });
      if (result?.uri) await upload(result.uri, dir);
      else {
        setError("No video was recorded");
        setStage("idle");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recording failed");
      setStage("idle");
    }
  };

  // Let the user pick the direction when it wasn't provided by the caller.
  if (!direction) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space(4), gap: space(3) }}>
        <Card style={{ gap: space(3) }}>
          <Text style={{ fontWeight: "700", color: colors.text, fontSize: 16 }}>
            Record a 15-second video
          </Text>
          <Muted>Choose whether you are leaving or returning to the PG.</Muted>
          <Row style={{ gap: space(3) }}>
            <View style={{ flex: 1 }}>
              <Button label="I am leaving" icon="exit-outline" onPress={() => setDirection("CHECK_OUT")} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="I have returned"
                variant="success"
                icon="enter-outline"
                onPress={() => setDirection("CHECK_IN")}
              />
            </View>
          </Row>
        </Card>
      </View>
    );
  }

  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space(4), gap: space(3) }}>
        <Card style={{ gap: space(2) }}>
          <Text style={{ fontWeight: "700", color: colors.text }}>Recording needs the mobile app</Text>
          <Muted>Open Dev Hostel on your phone to record the 15-second check-in/out video.</Muted>
        </Card>
        <Button label="Go back" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  if (!camPerm || !micPerm) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!camPerm.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space(4), gap: space(3) }}>
        <Card style={{ gap: space(2) }}>
          <Text style={{ fontWeight: "700", color: colors.text }}>Camera permission needed</Text>
          <Muted>Allow camera access to record the 15-second check-in/out video.</Muted>
        </Card>
        <Button label="Grant camera access" icon="camera-outline" onPress={() => requestCam()} />
      </View>
    );
  }

  const recording = stage === "recording";
  const mimeMuted = !micPerm.granted;
  const dirLabel = direction === "CHECK_IN" ? "Check in" : "Check out";

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <View style={styles.cameraWrap}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          mode="video"
          facing={facing}
          videoQuality="480p"
          mute={mimeMuted}
        />
        <View pointerEvents="none" style={styles.overlay}>
          <View style={[styles.circle, { borderColor: recording ? "#EF4444" : "rgba(255,255,255,0.85)" }]} />
          <Text style={styles.hint}>
            {recording ? `Recording… ${seconds}s` : `Center ${targetName} in the circle`}
          </Text>
        </View>
      </View>

      <View style={[styles.controls, { backgroundColor: colors.bg }]}>
        <ErrorText>{error}</ErrorText>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16, textAlign: "center" }}>
          {dirLabel} · 15s live video
        </Text>
        {params.room ? <Muted style={{ textAlign: "center" }}>Room {params.room}</Muted> : null}

        <Row style={{ justifyContent: "center", gap: space(4), marginTop: space(3) }}>
          {stage === "idle" ? (
            <>
              <Button label="Flip" variant="ghost" icon="camera-reverse-outline" onPress={() => setFacing((f) => (f === "front" ? "back" : "front"))} />
              <Pressable onPress={() => start(direction)} style={styles.recordBtn}>
                <View style={styles.recordDot} />
              </Pressable>
              <View style={{ width: 96 }} />
            </>
          ) : null}

          {recording ? (
            <Button
              label="Stop"
              variant="danger"
              icon="stop"
              onPress={() => cameraRef.current?.stopRecording()}
            />
          ) : null}

          {stage === "uploading" ? (
            <Row style={{ gap: space(2) }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.text, fontWeight: "600" }}>Uploading video…</Text>
            </Row>
          ) : null}

          {stage === "done" ? (
            <Text style={{ color: colors.success, fontWeight: "800", fontSize: 16 }}>
              Saved ✓
            </Text>
          ) : null}
        </Row>

        {stage === "idle" ? (
          <Muted style={{ textAlign: "center", marginTop: space(3), fontSize: 12 }}>
            A 15-second clip is recorded and kept until the next check-in/out.
          </Muted>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  cameraWrap: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    backgroundColor: "#000",
    overflow: "hidden",
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: space(3),
  },
  circle: {
    width: "70%",
    aspectRatio: 1,
    borderRadius: 9999,
    borderWidth: 4,
  },
  hint: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  controls: {
    padding: space(4),
    paddingBottom: space(8),
    gap: space(2),
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    marginTop: -space(4),
  },
  recordBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.12)",
  },
  recordDot: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#EF4444" },
});
