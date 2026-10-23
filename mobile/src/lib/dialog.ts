import { Alert, Platform } from "react-native";

/**
 * Cross-platform message. React Native Web does not run Alert callbacks, so on
 * the web/desktop build we fall back to the browser dialog (which Tauri shows
 * as a native window prompt as well).
 */
export function notify(title: string, message?: string): void {
  if (Platform.OS === "web") {
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
  if (Platform.OS === "web") {
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
