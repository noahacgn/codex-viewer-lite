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

const loadSseModule = async () => {
  vi.resetModules();
  return await import("$lib/client/sse");
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

describe("startSse", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(globalThis, "EventSource", {
      configurable: true,
      value: MockEventSource,
      writable: true,
    });
    MockEventSource.instances = [];
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.resetModules();
    delete (globalThis as { EventSource?: typeof EventSource }).EventSource;
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
});
