import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import { darkColors, lightColors, type ThemeColors } from "@/lib/theme";

export type Theme = {
  colors: ThemeColors;
  isDark: boolean;
  toggle: () => void;
};

export const ThemeContext = createContext<Theme>({
  colors: lightColors,
  isDark: false,
  toggle: () => {},
});

const STORAGE_KEY = "pg-manage-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemDark = useColorScheme() === "dark";
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active) return;
        setIsDark(stored === null ? systemDark : stored === "dark");
      })
      .catch(() => {
        if (active) setIsDark(systemDark);
      });
    return () => {
      active = false;
    };
  }, [systemDark]);

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const next = prev === null ? !systemDark : !prev;
      AsyncStorage.setItem(STORAGE_KEY, next ? "dark" : "light").catch(() => {});
      return next;
    });
  }, [systemDark]);

  const value = useMemo<Theme>(
    () => ({
      colors: isDark ? darkColors : lightColors,
      isDark: !!isDark,
      toggle,
    }),
    [isDark, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}