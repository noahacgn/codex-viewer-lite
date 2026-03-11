import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MockEventSource {
  public static instances: MockEventSource[] = [];

  public onerror: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent<string>) => void) | null = null;
  public onopen: ((event: Event) => void) | null = null;

  private readonly listeners = new Map<string, EventListener[]>();

  public closed = false;
  public readonly url: string;

  public constructor(url: string | URL) {
    this.url = String(url);
    MockEventSource.instances.push(this);
  }

  public addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  public close() {
    this.closed = true;
  }

  public emit(type: string, payload: unknown) {
    const event = { data: JSON.stringify(payload) } as MessageEvent<string>;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as unknown as Event);
    }
  }

  public fail() {
    this.onerror?.({} as Event);
  }

  public open() {
    this.onopen?.({} as Event);
  }
}

class MockNotification {
  public static instances: MockNotification[] = [];
  public static permission: NotificationPermission = "default";
  public static requestPermission = vi.fn(async () => MockNotification.permission);

  public onclick: (() => void) | null = null;
  public readonly options?: NotificationOptions;
  public readonly title: string;

  public constructor(title: string, options?: NotificationOptions) {
    this.options = options;
    this.title = title;
    MockNotification.instances.push(this);
  }

  public close() {
    return undefined;
  }
}

const loadSseModule = async () => {
  vi.resetModules();
  return await import("$lib/client/sse");
};

const loadReconnectAlertsModule = async () => {
  return await import("$lib/client/codex-reconnect-alerts");
};

const sessionChangedEvent = {
  data: {
    fileEventType: "change",
    projectId: "project-id",
    sessionId: "session-id",
  },
  id: "event-id",
  timestamp: "2026-03-11T00:00:00.000Z",
  type: "session_changed" as const,
};

const reconnectDetectedEvent = {
  data: {
    message: "stream disconnected - retrying sampling request",
    source: "codex-tui.log" as const,
  },
  id: "event-id",
  timestamp: "2026-03-11T00:00:00.000Z",
  type: "codex_reconnect_detected" as const,
};

describe("startSse", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-11T00:00:00.000Z"));
    Object.defineProperty(globalThis, "EventSource", {
      configurable: true,
      value: MockEventSource,
      writable: true,
    });
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: MockNotification,
      writable: true,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { hidden: false },
      writable: true,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { focus: vi.fn() },
      writable: true,
    });
    MockEventSource.instances = [];
    MockNotification.instances = [];
    MockNotification.permission = "default";
    MockNotification.requestPermission.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.resetModules();
    delete (globalThis as { EventSource?: typeof EventSource }).EventSource;
    delete (globalThis as { Notification?: typeof Notification }).Notification;
    delete (globalThis as { document?: Document }).document;
    delete (globalThis as { window?: Window }).window;
  });

  it("refreshes after a session change event", async () => {
    const { startSse } = await loadSseModule();
    const onRefresh = vi.fn();

    const stop = startSse(onRefresh);
    const source = MockEventSource.instances[0];

    expect(source?.url).toBe("/api/events/state_changes");
    source?.emit("session_changed", sessionChangedEvent);

    expect(onRefresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(180);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    stop();
    expect(source?.closed).toBe(true);
  });

  it("refreshes once when a reconnect succeeds", async () => {
    const { connectionState, startSse } = await loadSseModule();
    const onRefresh = vi.fn();

    const stop = startSse(onRefresh);
    const source = MockEventSource.instances[0];

    source?.open();
    expect(get(connectionState)).toBe("connected");
    expect(onRefresh).not.toHaveBeenCalled();

    source?.fail();
    expect(get(connectionState)).toBe("reconnecting");

    source?.open();
    vi.advanceTimersByTime(180);

    expect(get(connectionState)).toBe("connected");
    expect(onRefresh).toHaveBeenCalledTimes(1);

    stop();
  });

  it("does not refresh on reconnect alerts and updates the alert store", async () => {
    const { startSse } = await loadSseModule();
    const { visibleCodexReconnectIncident } = await loadReconnectAlertsModule();
    const onRefresh = vi.fn();

    startSse(onRefresh);
    const source = MockEventSource.instances[0];

    source?.emit("codex_reconnect_detected", reconnectDetectedEvent);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(get(visibleCodexReconnectIncident)).toMatchObject({
      detectedAt: "2026-03-11T00:00:00.000Z",
      message: "stream disconnected - retrying sampling request",
      source: "codex-tui.log",
    });
  });

  it("shows a system notification when the tab is hidden and permission is granted", async () => {
    MockNotification.permission = "granted";
    (globalThis as { document: { hidden: boolean } }).document.hidden = true;
    const { startSse } = await loadSseModule();

    startSse(vi.fn());
    const source = MockEventSource.instances[0];

    source?.emit("codex_reconnect_detected", reconnectDetectedEvent);

    expect(MockNotification.instances).toHaveLength(1);
    expect(MockNotification.instances[0]?.title).toBe("Codex CLI reconnect activity detected");
  });

  it("keeps the alert in-page only when the tab is visible", async () => {
    MockNotification.permission = "granted";
    const { startSse } = await loadSseModule();
    const { visibleCodexReconnectIncident } = await loadReconnectAlertsModule();

    startSse(vi.fn());
    const source = MockEventSource.instances[0];

    source?.emit("codex_reconnect_detected", reconnectDetectedEvent);

    expect(MockNotification.instances).toHaveLength(0);
    expect(get(visibleCodexReconnectIncident)?.detectedAt).toBe("2026-03-11T00:00:00.000Z");
  });

  it("does not auto-request notification permission when permission is still default", async () => {
    const { startSse } = await loadSseModule();

    startSse(vi.fn());
    const source = MockEventSource.instances[0];
    (globalThis as { document: { hidden: boolean } }).document.hidden = true;
    source?.emit("codex_reconnect_detected", reconnectDetectedEvent);

    expect(MockNotification.requestPermission).not.toHaveBeenCalled();
    expect(MockNotification.instances).toHaveLength(0);
  });
});
