import { Redirect } from "expo-router";
import { View } from "react-native";
import { Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <Loading />
      </View>
    );
  }
  return <Redirect href={user ? "/(tabs)" : "/login"} />;
}
