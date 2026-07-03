"use client";

import { useSyncExternalStore } from "react";

export const TOKEN_KEY = "medkit_token";
export const EMAIL_KEY = "medkit_email";
const SESSION_EVENT = "medkit-session-change";

function emitSessionChange() {
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function saveSession(token: string, email: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(EMAIL_KEY, email);
  emitSessionChange();
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(EMAIL_KEY);
  emitSessionChange();
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(SESSION_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(SESSION_EVENT, onStoreChange);
  };
}

function getSnapshot() {
  return JSON.stringify({
    token: window.localStorage.getItem(TOKEN_KEY),
    email: window.localStorage.getItem(EMAIL_KEY),
  });
}

function getServerSnapshot() {
  return '{"token":null,"email":null}';
}

export function useSession(): { token: string | null; email: string | null } {
  return JSON.parse(
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot),
  ) as { token: string | null; email: string | null };
}
