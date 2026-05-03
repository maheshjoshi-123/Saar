import { AuthSession, UploadedAsset, uploadAsset, userHeaders } from "@/lib/api";

export type UserSession = {
  userId: string;
  userToken: string;
  name?: string | null;
  demo: boolean;
  tier?: string | null;
};

export const AUTH_STORAGE_KEY = "saar_demo_auth_session_v1";
export const DEMO_USER_ID = "china-laptop-seller";
export const DEMO_USER_NAME = "China Laptop Seller";
export const DEMO_USER_TIER = "pro";
export const DEMO_USER_TOKEN = "";

export function createDemoSession(): UserSession {
  return {
    userId: DEMO_USER_ID,
    userToken: DEMO_USER_TOKEN,
    name: DEMO_USER_NAME,
    demo: true,
    tier: DEMO_USER_TIER,
  };
}

export function sessionFromAuth(result: AuthSession): UserSession {
  return {
    userId: result.user_id,
    userToken: result.token || "",
    name: result.name || result.user_id,
    demo: result.demo,
    tier: result.tier || DEMO_USER_TIER,
  };
}

export function loadStoredSession(): UserSession {
  if (typeof window === "undefined") return createDemoSession();
  try {
    const saved = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || "null") as Partial<UserSession> | null;
    if (!saved?.userId) return createDemoSession();
    const session = {
      userId: saved.userId,
      userToken: "",
      name: saved.name || saved.userId,
      demo: saved.demo ?? saved.userId === DEMO_USER_ID,
      tier: saved.tier || (saved.userId === DEMO_USER_ID ? DEMO_USER_TIER : null),
    };
    if (saved.userToken) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    }
    return session;
  } catch {
    return createDemoSession();
  }
}

export function saveSession(session: UserSession): void {
  if (typeof window === "undefined") return;
  try {
    if (isDefaultDemoSession(session)) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    const persistedSession = { ...session, userToken: "" };
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(persistedSession));
  } catch {
    // Non-critical browser storage can fail in private browsing.
  }
}

export function clearStoredSession(): UserSession {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Clearing local UI state should not block logout.
    }
  }
  return createDemoSession();
}

export function sessionHeaders(session: UserSession): HeadersInit {
  return userHeaders(session.userId, session.userToken);
}

export function uploadAssetForSession(file: File, session: UserSession): Promise<UploadedAsset> {
  return uploadAsset(file, session.userId, session.userToken);
}

export function isSignedInSession(session: UserSession): boolean {
  return Boolean(session.userId);
}

function isDefaultDemoSession(session: UserSession): boolean {
  return session.userId === DEMO_USER_ID && !session.userToken;
}
