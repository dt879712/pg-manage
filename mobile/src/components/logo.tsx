import { Image } from "react-native";

/** Dev Hostel logo — brand image in a rounded badge. */
export function Logo({ size = 48 }: { size?: number }) {
  return (
    <Image
      source={require("../../assets/logo.png")}
      style={{ width: size, height: size, borderRadius: size * 0.23 }}
      resizeMode="cover"
    />
  );
}
