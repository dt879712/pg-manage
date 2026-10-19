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
