import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, loadApiUrl, loadToken, saveToken } from "./api";
import { syncPushToken } from "./push";
import { invalidateApiCache } from "./useApi";
import type { AuthUser } from "./types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  switchPg: (pgId: string) => Promise<AuthUser>;
  sessionKey: number;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        await loadApiUrl();
        const stored = await loadToken();
        if (stored) {
          const res = await api<{ user: AuthUser }>("/auth/me");
          setUser(res.user);
          void syncPushToken();
        }
      } catch {
        await saveToken(null);
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
    void syncPushToken();
    return res.user;
  };

  const signOut = async () => {
    await saveToken(null);
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
    const me = await api<{ user: AuthUser }>("/auth/me");
    setUser(me.user);
    setSessionKey((n) => n + 1);
    void syncPushToken();
    return me.user;
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signOut, setUser, switchPg, sessionKey }}
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
