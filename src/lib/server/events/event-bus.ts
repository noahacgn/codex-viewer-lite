import { EventEmitter } from "node:events";
import type { CodexReconnectSource, SseEvent } from "$lib/shared/types";

const createEventId = () => {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const withCommonFields = <T extends Omit<SseEvent, "id" | "timestamp">>(event: T, timestamp?: string): SseEvent => {
  return {
    ...event,
    id: createEventId(),
    timestamp: timestamp ?? new Date().toISOString(),
  } as SseEvent;
};

export const createReconnectDetectedEvent = (message: string, source: CodexReconnectSource, timestamp?: string) => {
  return withCommonFields({ type: "codex_reconnect_detected", data: { message, source } }, timestamp);
};

class SseEventBus {
  private readonly emitter = new EventEmitter();

  public on(listener: (event: SseEvent) => void) {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  public emitConnected(message: string) {
    this.emitter.emit("event", withCommonFields({ type: "connected", message }));
  }

  public emitHeartbeat() {
    this.emitter.emit("event", withCommonFields({ type: "heartbeat" }));
  }

  public emitProjectChanged(projectId: string | null, fileEventType: string) {
    this.emitter.emit("event", withCommonFields({ type: "project_changed", data: { projectId, fileEventType } }));
  }

  public emitSessionChanged(projectId: string | null, sessionId: string | null, fileEventType: string) {
    this.emitter.emit(
      "event",
      withCommonFields({ type: "session_changed", data: { projectId, sessionId, fileEventType } }),
    );
  }

  public emitReconnectDetected(message: string, source: CodexReconnectSource, detectedAt?: string) {
    this.emitter.emit("event", createReconnectDetectedEvent(message, source, detectedAt));
  }
}

const globalSymbol = Symbol.for("codex-viewer-lite.sse-bus");
const store = globalThis as unknown as Record<symbol, SseEventBus | undefined>;

export const getSseEventBus = () => {
  if (!store[globalSymbol]) {
    store[globalSymbol] = new SseEventBus();
  }
  const bus = store[globalSymbol];
  if (!bus) {
    throw new Error("Failed to initialize SSE event bus");
  }
  return bus;
};
