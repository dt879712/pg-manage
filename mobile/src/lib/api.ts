import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// On a physical device the dev server host (e.g. 192.168.1.5) is reused so the
// phone can reach the backend on the same machine. Override with EXPO_PUBLIC_API_URL
// or change it in-app from the Profile screen.
const devHost = (Constants.expoConfig?.hostUri ?? "").split(":")[0];

const PRODUCTION_API_URL = "https://dev-hostel-api.onrender.com";

const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (devHost
    ? `http://${devHost}:4000`
    : __DEV__
      ? "http://localhost:4000"
      : PRODUCTION_API_URL);

let apiUrl = DEFAULT_API_URL;

export function getApiUrl(): string {
  return apiUrl;
}

// Localhost / LAN addresses only work on the developer's own network. A shipped
// app must ignore any such value saved during development so it keeps working on
// any network.
function isPrivateApiUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".local") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}

export async function loadApiUrl(): Promise<void> {
  const saved = await AsyncStorage.getItem("pg_manage_api_url");
  if (saved && (__DEV__ || !isPrivateApiUrl(saved))) apiUrl = saved.replace(/\/+$/, "");
}

export async function setApiUrl(url: string): Promise<void> {
  const next = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/.+/i.test(next)) {
    throw new Error("Enter a valid server address, e.g. http://192.168.1.42:4000");
  }
  apiUrl = next;
  await AsyncStorage.setItem("pg_manage_api_url", next);
}

const TOKEN_KEY = "pg_manage_token";
let token: string | null = null;

export async function loadToken(): Promise<string | null> {
  token = await AsyncStorage.getItem(TOKEN_KEY);
  return token;
}

export async function saveToken(next: string | null): Promise<void> {
  token = next;
  if (next) await AsyncStorage.setItem(TOKEN_KEY, next);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return token;
}

export class ApiError extends Error {
  status: number;
  data: { canReset?: boolean; error?: string } | null;
  constructor(message: string, status: number, data: { canReset?: boolean; error?: string } | null = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
}

// Long timeout + one silent retry so a sleeping free-tier server has time to
// wake up instead of surfacing a scary error to the user.
const REQUEST_TIMEOUT_MS = 75_000;
const MAX_ATTEMPTS = 2;

type RetryListener = (attempt: number, max: number) => void;
let retryListener: RetryListener | null = null;
export function setRetryListener(cb: RetryListener | null): void {
  retryListener = cb;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.auth !== false && token) headers.Authorization = `Bearer ${token}`;

  let res: Response | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !res; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      res = await fetch(`${apiUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch {
      // Network error or timeout — usually the free server waking from sleep.
      if (attempt < MAX_ATTEMPTS) {
        retryListener?.(attempt, MAX_ATTEMPTS);
        await sleep(2000 * attempt);
      } else {
        throw new ApiError(`Cannot reach server at ${apiUrl}`, 0);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  if (!res) throw new ApiError(`Cannot reach server at ${apiUrl}`, 0);

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data);
  }
  return data as T;
}
