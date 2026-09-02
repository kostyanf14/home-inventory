import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./auth";

// Empty by default: dev uses the Vite proxy, production sets VITE_API_BASE_URL
// (or serves the API on the same origin behind a reverse proxy).
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE_URL}/api/v1${path}`;
}

/** FastAPI returns `detail` as a string, or as a list of validation errors. */
export function formatErrorDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail) {
    return detail;
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        const item = entry as { msg?: unknown; loc?: unknown };
        const field = Array.isArray(item.loc)
          ? item.loc.filter((part) => part !== "body").join(".")
          : "";
        const message = typeof item.msg === "string" ? item.msg : "";
        return field && message ? `${field}: ${message}` : message;
      })
      .filter(Boolean);
    if (messages.length) {
      return messages.join("; ");
    }
  }
  return fallback;
}

export async function readError(response: Response, fallback = "Request failed"): Promise<string> {
  const body = await response.json().catch(() => null);
  return formatErrorDetail((body as { detail?: unknown } | null)?.detail, fallback);
}

let refreshInFlight: Promise<string> | null = null;

async function requestNewAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return "";
  }

  const response = await fetch(apiUrl("/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    return "";
  }

  const tokens = (await response.json()) as { access_token: string; refresh_token: string };
  setTokens(tokens);
  return tokens.access_token;
}

/** One refresh at a time, however many requests hit 401 together. */
function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= requestNewAccessToken()
    .catch(() => "")
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

function send(path: string, token: string, init?: RequestInit) {
  return fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
}

export async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  let response = await send(path, token, init);

  if (response.status === 401 && token) {
    // Access tokens are short-lived; trade the refresh token for a new one before giving up.
    const freshToken = await refreshAccessToken();
    if (freshToken) {
      response = await send(path, freshToken, init);
    }
    if (response.status === 401) {
      clearTokens();
      throw new Error("Your session has expired. Please sign in again.");
    }
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.status === 204 ? (undefined as T) : response.json();
}

export async function logout(): Promise<void> {
  const token = getAccessToken();
  if (token) {
    await fetch(apiUrl("/auth/logout"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }
  clearTokens();
}
