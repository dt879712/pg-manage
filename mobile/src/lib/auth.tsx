import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError, api, loadApiUrl, loadToken, saveToken } from "./api";
import { disableWebPush, syncPushToken } from "./push";
import { invalidateApiCache } from "./useApi";
import type { AuthUser } from "./types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  switchPg: (pgId: string) => Promise<AuthUser>;
  refresh: () => void;
  sessionKey: number;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const CACHED_USER_KEY = "pg_manage_cached_user";

async function saveCachedUser(user: AuthUser | null): Promise<void> {
  if (user) await AsyncStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
  else await AsyncStorage.removeItem(CACHED_USER_KEY);
}

async function loadCachedUser(): Promise<AuthUser | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as AuthUser;
    if (typeof value.id !== "string" || typeof value.name !== "string" || typeof value.role !== "string") return null;
    return value;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionKey, setSessionKey] = useState(0);
  const setUser = (next: AuthUser | null) => {
    setCurrentUser(next);
    void saveCachedUser(next);
  };

  useEffect(() => {
    (async () => {
      try {
        await loadApiUrl();
        const stored = await loadToken();
        if (!stored) {
          await saveCachedUser(null);
          return;
        }

        // Restore the device's last signed-in profile immediately. A sleeping
        // or temporarily unreachable API must not make the app appear logged out.
        const cached = await loadCachedUser();
        if (cached) setUser(cached);

        try {
          const res = await api<{ user: AuthUser; token?: string }>("/auth/me");
          if (res.token) await saveToken(res.token);
          setUser(res.user);
          await saveCachedUser(res.user);
          void syncPushToken();
        } catch (error) {
          // Only remove a saved session when the API confirms it is invalid or
          // the account no longer exists. Keep it through network/5xx errors.
          if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
            await saveToken(null);
            await saveCachedUser(null);
            setUser(null);
          }
        }
      } catch {
        // Storage/API startup issues should not erase credentials. Explicit
        // sign-out and confirmed invalid tokens are the only clearing paths.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = async (email: string, password: string) => {
    const res = await api<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    invalidateApiCache();
    await saveToken(res.token);
    setUser(res.user);
    await saveCachedUser(res.user);
    void syncPushToken();
    return res.user;
  };

  const signOut = async () => {
    try {
      await disableWebPush();
    } catch {
      // Signing out must still work if subscription cleanup is offline.
    }
    await saveToken(null);
    await saveCachedUser(null);
    invalidateApiCache();
    setUser(null);
  };

  // Switch the owner's active PG. The server issues a fresh JWT bound to the
  // new tenant; we persist it, drop cached responses and bump sessionKey so
  // every mounted screen remounts and refetches against the new PG.
  const switchPg = async (pgId: string) => {
    const res = await api<{ token: string; pg: { id: string; name: string } }>(
      `/tenant/pgs/${pgId}/switch`,
      { method: "POST", body: {} }
    );
    await saveToken(res.token);
    invalidateApiCache();
    const me = await api<{ user: AuthUser; token?: string }>("/auth/me");
    if (me.token) await saveToken(me.token);
    setUser(me.user);
    await saveCachedUser(me.user);
    setSessionKey((n) => n + 1);
    void syncPushToken();
    return me.user;
  };

  // Force every screen to remount and refetch, keeping the current PG. This is
  // the manual "Refresh" control — same effect as switching PG, minus the switch.
  const refresh = () => {
    invalidateApiCache();
    setSessionKey((n) => n + 1);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signOut, setUser, switchPg, refresh, sessionKey }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
