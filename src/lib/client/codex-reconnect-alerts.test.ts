import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MockNotification {
  public static instances: MockNotification[] = [];
  public static permission: NotificationPermission = "default";
  public static requestPermission = vi.fn(async () => MockNotification.permission);

  public onclick: (() => void) | null = null;
  public readonly options?: NotificationOptions;
  public readonly title: string;
  public closed = false;

  public constructor(title: string, options?: NotificationOptions) {
    this.options = options;
    this.title = title;
    MockNotification.instances.push(this);
  }

  public close() {
    this.closed = true;
  }
}

const setDocumentHidden = (hidden: boolean) => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { hidden },
    writable: true,
  });
};

const loadAlertsModule = async () => {
  vi.resetModules();
  return await import("$lib/client/codex-reconnect-alerts");
};

describe("codex reconnect alerts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-11T10:00:00.000Z"));
    MockNotification.instances = [];
    MockNotification.permission = "default";
    MockNotification.requestPermission.mockClear();
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: MockNotification,
      writable: true,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { focus: vi.fn() },
      writable: true,
    });
    setDocumentHidden(false);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    delete (globalThis as { Notification?: typeof Notification }).Notification;
    delete (globalThis as { document?: Document }).document;
    delete (globalThis as { window?: Window }).window;
  });

  it("dismisses only the current incident and shows the next one", async () => {
    const { dismiss, reportIncident, visibleCodexReconnectIncident } = await loadAlertsModule();

    reportIncident({
      detectedAt: "2026-03-11T10:00:00.000Z",
      message: "stream disconnected - retrying sampling request",
      source: "codex-tui.log",
    });
    dismiss();

    expect(get(visibleCodexReconnectIncident)).toBeNull();

    reportIncident({
      detectedAt: "2026-03-11T10:00:40.000Z",
      message: "stream disconnected - retrying sampling request",
      source: "codex-tui.log",
    });

    expect(get(visibleCodexReconnectIncident)?.detectedAt).toBe("2026-03-11T10:00:40.000Z");
  });

  it("resets the 60-second visibility window for a new incident", async () => {
    const { reportIncident, visibleCodexReconnectIncident } = await loadAlertsModule();

    reportIncident({
      detectedAt: "2026-03-11T10:00:05.000Z",
      message: "stream disconnected - retrying sampling request",
      source: "codex-tui.log",
    });

    expect(get(visibleCodexReconnectIncident)?.visibleUntil).toBe("2026-03-11T10:01:05.000Z");

    reportIncident({
      detectedAt: "2026-03-11T10:01:10.000Z",
      message: "stream disconnected - retrying sampling request",
      source: "codex-tui.log",
    });

    expect(get(visibleCodexReconnectIncident)?.visibleUntil).toBe("2026-03-11T10:02:10.000Z");
  });

  it("falls back to the banner path when notifications are unsupported", async () => {
    delete (globalThis as { Notification?: typeof Notification }).Notification;
    const { codexReconnectAlertState, reportIncident, visibleCodexReconnectIncident } = await loadAlertsModule();

    reportIncident({
      detectedAt: "2026-03-11T10:00:00.000Z",
      message: "stream disconnected - retrying sampling request",
      source: "codex-tui.log",
    });

    expect(get(codexReconnectAlertState).notificationsSupported).toBe(false);
    expect(get(codexReconnectAlertState).notificationPermission).toBe("unsupported");
    expect(get(visibleCodexReconnectIncident)?.source).toBe("codex-tui.log");
  });
});
