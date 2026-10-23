import AsyncStorage from "@react-native-async-storage/async-storage";
import { EncodingType, File, Paths } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

const DIR_KEY = "download.directory.uri";

async function isUsable(dirUri: string): Promise<boolean> {
  try {
    await LegacyFileSystem.readDirectoryAsync(dirUri);
    return true;
  } catch {
    return false;
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Opens an HTML document for reading/printing: a separate browser tab in a
 * browser, or a native preview window inside the Tauri desktop app (where
 * `window.open` is a no-op).
 */
export async function openHtmlInWindow(html: string, title: string): Promise<void> {
  if (isTauri()) {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const win = new WebviewWindow(`preview-${Date.now()}`, {
      url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
      title,
      width: 900,
      height: 1000,
      center: true,
    });
    await new Promise<void>((resolve, reject) => {
      win.once("tauri://error", (event) => {
        const payload = (event as { payload?: unknown } | undefined)?.payload;
        reject(new Error(typeof payload === "string" ? payload : "Could not open the preview window"));
      });
      win.once("tauri://created", () => resolve());
    });
    return;
  }
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Saves an in-memory blob on the web/desktop build: a normal browser download
 * in a browser, or a native save dialog inside the Tauri desktop app (where a
 * plain anchor download is silently dropped).
 */
export async function saveBlobFile(blob: Blob, filename: string): Promise<void> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: filename });
    if (!path) return;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Saves base64-encoded bytes into a location the user can find, without the OS
 * share sheet. On Android the user picks a folder once and it is reused for
 * later downloads; elsewhere the app's Documents directory is used.
 */
export async function saveBase64File(
  base64: string,
  filename: string,
  mimeType = "application/octet-stream"
): Promise<string> {
  if (Platform.OS === "android") {
    let dirUri = await AsyncStorage.getItem(DIR_KEY);
    if (dirUri && !(await isUsable(dirUri))) dirUri = null;
    if (!dirUri) {
      const perm = await LegacyFileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) throw new Error("Pick a folder to save the file");
      dirUri = perm.directoryUri;
      await AsyncStorage.setItem(DIR_KEY, dirUri);
    }
    const fileUri = await LegacyFileSystem.StorageAccessFramework.createFileAsync(
      dirUri,
      filename,
      mimeType
    );
    await LegacyFileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: LegacyFileSystem.EncodingType.Base64,
    });
    return fileUri;
  }

  const file = new File(Paths.document, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: EncodingType.Base64 });
  return file.uri;
}
