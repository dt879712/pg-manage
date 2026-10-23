import { Alert, Platform } from "react-native";

/**
 * Cross-platform dialogs. React Native Web does not run Alert callbacks, and
 * Tauri's webview does not reliably show window.confirm(), so the app renders
 * its own dialog host (see components/DialogHost.tsx) and these helpers route
 * requests to it. The native/browser paths remain as fallbacks.
 */
export type DialogRequest =
  | { kind: "alert"; title: string; message?: string }
  | {
      kind: "confirm";
      title: string;
      message?: string;
      confirmLabel: string;
      destructive: boolean;
      resolve: (value: boolean) => void;
    };

type DialogHandler = (request: DialogRequest) => void;

let handler: DialogHandler | null = null;

export function setDialogHandler(next: DialogHandler | null): void {
  handler = next;
}

export function notify(title: string, message?: string): void {
  if (handler) {
    handler({ kind: "alert", title, message });
    return;
  }
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function confirmAction(options: {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { title, message, confirmLabel = "OK", destructive = false } = options;
  const show = handler;
  if (show) {
    return new Promise((resolve) =>
      show({ kind: "confirm", title, message, confirmLabel, destructive, resolve })
    );
  }
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => done(false) },
        {
          text: confirmLabel,
          style: destructive ? "destructive" : "default",
          onPress: () => done(true),
        },
      ],
      { cancelable: true, onDismiss: () => done(false) }
    );
  });
}
