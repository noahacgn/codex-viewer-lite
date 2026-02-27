import { writable } from "svelte/store";
import type { SseEvent } from "$lib/shared/types";

type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export const connectionState = writable<ConnectionState>("connecting");

let source: EventSource | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleRefresh = (onRefresh: () => void) => {
  if (refreshTimer) {
    return;
  }
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    onRefresh();
  }, 180);
};

export const startSse = (onRefresh: () => void) => {
  if (source) {
    return () => undefined;
  }

  connectionState.set("connecting");
  source = new EventSource("/api/events/state_changes");

  source.onopen = () => {
    connectionState.set("connected");
  };

  source.onerror = () => {
    connectionState.set("reconnecting");
  };

  source.onmessage = (event) => {
    const payload = JSON.parse(event.data) as SseEvent;
    if (payload.type === "project_changed" || payload.type === "session_changed") {
      scheduleRefresh(onRefresh);
    }
  };

  return () => {
    if (!source) {
      return;
    }
    source.close();
    source = null;
    connectionState.set("disconnected");
  };
};
