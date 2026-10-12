import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

export function useRefreshOnFocus(reload: () => void) {
  const run = useCallback(() => reload(), [reload]);
  useFocusEffect(run);
}