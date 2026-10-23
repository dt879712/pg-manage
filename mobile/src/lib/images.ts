import * as ImagePicker from "expo-image-picker";
import { Alert, Platform } from "react-native";
import { notify } from "./dialog";

export interface PickedImage {
  dataUrl: string;
  mimeType: string;
}

async function pick(source: "library" | "camera"): Promise<PickedImage | null> {
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      notify("Permission needed", "Camera permission is required to take a photo.");
      return null;
    }
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify("Permission needed", "Photo library permission is required.");
      return null;
    }
  }

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.4, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.4, base64: true });

  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (!asset.base64) return null;
  const mimeType = asset.mimeType ?? "image/jpeg";
  return { dataUrl: `data:${mimeType};base64,${asset.base64}`, mimeType };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

/** Desktop/web: shrink large camera photos so uploads stay well under the API limit. */
async function shrinkDataUrl(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not load the image"));
    el.src = dataUrl;
  });
  const max = 1600;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  if (scale >= 1 && dataUrl.length < 900_000) return dataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

/** Desktop/web: use the browser file chooser instead of the mobile picker. */
function pickOnWeb(): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";

    let settled = false;
    const finish = (value: PickedImage | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      try {
        const raw = await readAsDataUrl(file);
        const dataUrl = await shrinkDataUrl(raw);
        finish({ dataUrl, mimeType: "image/jpeg" });
      } catch {
        finish(null);
      }
    };
    input.oncancel = () => finish(null);

    document.body.appendChild(input);
    input.click();
  });
}

export function chooseImage(title = "Add image"): Promise<PickedImage | null> {
  if (Platform.OS === "web") return pickOnWeb();
  return new Promise((resolve) => {
    Alert.alert(
      title,
      "Choose a source",
      [
        { text: "Camera", onPress: () => pick("camera").then(resolve) },
        { text: "Photo library", onPress: () => pick("library").then(resolve) },
        { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });
}
