import { EventEmitter } from "node:events";
import type { SseEvent } from "$lib/shared/types";

const createEventId = () => {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const withCommonFields = <T extends Omit<SseEvent, "id" | "timestamp">>(event: T): SseEvent => {
  return {
    ...event,
    id: createEventId(),
    timestamp: new Date().toISOString(),
  } as SseEvent;
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
