import type { SseEvent } from "$lib/shared/types";

export const formatSseEvent = (event: SseEvent) => {
  return `event: ${event.type}\nid: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
};
