import { Hono } from "hono";
import { getSseEventBus } from "$lib/server/events/event-bus";
import { getFileWatcherService } from "$lib/server/events/file-watcher";
import { formatSseEvent } from "$lib/server/events/sse";
import { decodeProjectId } from "$lib/server/ids";
import { getProjects, getProjectWithSessions } from "$lib/server/services/projects";
import { getSession } from "$lib/server/services/sessions";

const createSseResponse = () => {
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const bus = getSseEventBus();
      const watcher = getFileWatcherService();
      watcher.startWatching();

      const writeEvent = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };

      unsubscribe = bus.on((event) => {
        writeEvent(formatSseEvent(event));
      });

      bus.emitConnected("SSE connection established");
      heartbeat = setInterval(() => {
        bus.emitHeartbeat();
      }, 30_000);
    },
    cancel() {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      if (unsubscribe) {
        unsubscribe();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
};

export const routes = new Hono()
  .get("/projects", async (c) => {
    return c.json({ projects: await getProjects() });
  })
  .get("/projects/:projectId", async (c) => {
    const projectId = c.req.param("projectId");
    try {
      const result = await getProjectWithSessions(projectId);
      return c.json(result);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 404);
    }
  })
  .get("/projects/:projectId/sessions/:sessionId", async (c) => {
    const projectId = c.req.param("projectId");
    const sessionId = c.req.param("sessionId");

    try {
      decodeProjectId(projectId);
      const session = await getSession(projectId, sessionId);
      return c.json({ session });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 404);
    }
  })
  .get("/events/state_changes", () => {
    return createSseResponse();
  });
