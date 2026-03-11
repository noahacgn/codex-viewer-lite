import { derived, get, writable } from "svelte/store";
import { locale, t } from "$lib/i18n/store";
import type { CodexReconnectSource } from "$lib/shared/types";

const INCIDENT_VISIBLE_WINDOW_MS = 60_000;

export type CodexReconnectIncident = {
  message: string;
  detectedAt: string;
  source: CodexReconnectSource;
  visibleUntil: string;
};

type NotificationPermissionState = NotificationPermission | "unsupported";

type CodexReconnectAlertState = {
  incident: CodexReconnectIncident | null;
  dismissedDetectedAt: string | null;
  notificationsSupported: boolean;
  notificationPermission: NotificationPermissionState;
};

const getNotificationPermissionState = (): NotificationPermissionState => {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
};

const createInitialState = (): CodexReconnectAlertState => {
  const notificationPermission = getNotificationPermissionState();
  return {
    dismissedDetectedAt: null,
    incident: null,
    notificationPermission,
    notificationsSupported: notificationPermission !== "unsupported",
  };
};

const reconnectAlertStateStore = writable<CodexReconnectAlertState>(createInitialState());

let expireTimer: ReturnType<typeof setTimeout> | null = null;
let lastNotifiedDetectedAt: string | null = null;

const clearExpireTimer = () => {
  if (!expireTimer) {
    return;
  }
  clearTimeout(expireTimer);
  expireTimer = null;
};

const syncNotificationState = () => {
  const notificationPermission = getNotificationPermissionState();
  reconnectAlertStateStore.update((state) => ({
    ...state,
    notificationPermission,
    notificationsSupported: notificationPermission !== "unsupported",
  }));
};

const scheduleIncidentExpiry = (incident: CodexReconnectIncident) => {
  clearExpireTimer();
  const timeoutMs = Date.parse(incident.visibleUntil) - Date.now();
  if (timeoutMs <= 0) {
    reconnectAlertStateStore.update((state) => ({ ...state, incident: null }));
    return;
  }
  expireTimer = setTimeout(() => {
    reconnectAlertStateStore.update((state) => {
      if (state.incident?.detectedAt !== incident.detectedAt) {
        return state;
      }
      return { ...state, incident: null };
    });
    expireTimer = null;
  }, timeoutMs);
};

const showSystemNotification = (incident: CodexReconnectIncident) => {
  if (typeof Notification === "undefined" || typeof document === "undefined" || !document.hidden) {
    return;
  }
  if (Notification.permission !== "granted" || lastNotifiedDetectedAt === incident.detectedAt) {
    return;
  }

  const currentLocale = get(locale);
  const notification = new Notification(t("reconnect.notification.title", currentLocale), {
    body: t("reconnect.notification.body", currentLocale),
  });

  notification.onclick = () => {
    if (typeof window !== "undefined") {
      window.focus();
    }
    notification.close();
  };
  lastNotifiedDetectedAt = incident.detectedAt;
};

export const codexReconnectAlertState = {
  subscribe: reconnectAlertStateStore.subscribe,
};

export const visibleCodexReconnectIncident = derived(reconnectAlertStateStore, ({ incident, dismissedDetectedAt }) => {
  if (!incident || incident.detectedAt === dismissedDetectedAt) {
    return null;
  }
  return incident;
});

/**
 * Records a reconnect incident for the current browser session and triggers optional notifications.
 */
export const reportIncident = (incident: { message: string; detectedAt: string; source: CodexReconnectSource }) => {
  syncNotificationState();
  const nextIncident = {
    ...incident,
    visibleUntil: new Date(Date.parse(incident.detectedAt) + INCIDENT_VISIBLE_WINDOW_MS).toISOString(),
  };

  reconnectAlertStateStore.update((state) => ({
    ...state,
    dismissedDetectedAt: state.incident?.detectedAt === nextIncident.detectedAt ? state.dismissedDetectedAt : null,
    incident: nextIncident,
  }));

  scheduleIncidentExpiry(nextIncident);
  showSystemNotification(nextIncident);
};

/**
 * Hides the currently visible reconnect incident until a new incident is reported.
 */
export const dismiss = () => {
  reconnectAlertStateStore.update((state) => {
    if (!state.incident) {
      return state;
    }
    return { ...state, dismissedDetectedAt: state.incident.detectedAt };
  });
};

/**
 * Requests browser notification permission from an explicit user gesture.
 */
export const requestPermission = async () => {
  syncNotificationState();
  if (typeof Notification === "undefined") {
    return "unsupported" as const;
  }
  const permission = await Notification.requestPermission();
  reconnectAlertStateStore.update((state) => ({
    ...state,
    notificationPermission: permission,
    notificationsSupported: true,
  }));
  return permission;
};

export const resetCodexReconnectAlertsForTests = () => {
  clearExpireTimer();
  lastNotifiedDetectedAt = null;
  reconnectAlertStateStore.set(createInitialState());
};
