const ACCESS_TOKEN_KEY = "inventory-token";
const REFRESH_TOKEN_KEY = "inventory-refresh-token";

export type TokenPair = {
  access_token: string;
  refresh_token?: string;
};

type Listener = (accessToken: string) => void;

const listeners = new Set<Listener>();

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // A blocked storage (private mode) still leaves the in-memory session usable.
  }
}

export function getAccessToken(): string {
  return read(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string {
  return read(REFRESH_TOKEN_KEY);
}

export function setTokens(tokens: TokenPair) {
  write(ACCESS_TOKEN_KEY, tokens.access_token);
  write(REFRESH_TOKEN_KEY, tokens.refresh_token ?? "");
  notify(tokens.access_token);
}

export function clearTokens() {
  write(ACCESS_TOKEN_KEY, "");
  write(REFRESH_TOKEN_KEY, "");
  notify("");
}

export function subscribeToToken(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(accessToken: string) {
  for (const listener of listeners) {
    listener(accessToken);
  }
}
