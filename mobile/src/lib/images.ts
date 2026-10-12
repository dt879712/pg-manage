import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

export interface PickedImage {
  dataUrl: string;
  mimeType: string;
}

async function pick(source: "library" | "camera"): Promise<PickedImage | null> {
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Camera permission is required to take a photo.");
      return null;
    }
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Photo library permission is required.");
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

export function chooseImage(title = "Add image"): Promise<PickedImage | null> {
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
