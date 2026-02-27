import type {
  CodexMessage,
  CodexSessionMeta,
  CodexSessionTurn,
  CodexToolCall,
  CodexToolResult,
} from "$lib/shared/types";

type CodexLogLine = {
  timestamp?: unknown;
  type?: unknown;
  payload?: unknown;
};

const createEntryId = (() => {
  let counter = 0;
  return (prefix: string) => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
})();

const sanitizeInstructionTags = (text: string) => {
  return text
    .replace(/<user_instructions>[\s\S]*?<\/user_instructions>/gi, "")
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, "")
    .replace(/<\/?.*?user_instructions>/gi, "")
    .replace(/<\/?.*?environment_context>/gi, "")
    .trim();
};

const extractTextFromUnknown = (value: unknown): string => {
  if (typeof value === "string") {
    return sanitizeInstructionTags(value);
  }
  if (!Array.isArray(value)) {
    return "";
  }

  const texts: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      texts.push(sanitizeInstructionTags(item));
      continue;
    }
    if (!item || typeof item !== "object") {
      continue;
    }
    const itemText = (item as { text?: unknown }).text;
    if (typeof itemText === "string") {
      texts.push(sanitizeInstructionTags(itemText));
    }
  }

  return texts.join("\n\n").trim();
};

const createTurn = (index: number): CodexSessionTurn => {
  return {
    id: `turn-${index}`,
    userMessage: null,
    assistantMessages: [],
    reasonings: [],
    toolCalls: [],
    toolResults: [],
  };
};

const parseEventMessageText = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const text = (payload as { text?: unknown }).text;
  if (typeof text === "string") {
    return sanitizeInstructionTags(text);
  }
  const message = (payload as { message?: unknown }).message;
  return typeof message === "string" ? sanitizeInstructionTags(message) : null;
};

const parseMessagePayload = (payload: unknown): { role: "user" | "assistant"; text: string } | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if ((payload as { type?: unknown }).type !== "message") {
    return null;
  }
  const role = (payload as { role?: unknown }).role === "assistant" ? "assistant" : "user";
  const text = extractTextFromUnknown((payload as { content?: unknown }).content).trim();
  if (!text) {
    return null;
  }
  return { role, text };
};

const addMessageToTurn = (turns: CodexSessionTurn[], role: "user" | "assistant", message: CodexMessage) => {
  if (turns.length === 0) {
    turns.push(createTurn(1));
  }

  const lastTurn = turns[turns.length - 1];
  if (!lastTurn) {
    return;
  }

  if (role === "user") {
    if (lastTurn.userMessage !== null) {
      const nextTurn = createTurn(turns.length + 1);
      nextTurn.userMessage = message;
      turns.push(nextTurn);
      return;
    }
    lastTurn.userMessage = message;
    return;
  }

  lastTurn.assistantMessages.push(message);
};

const ensureTurn = (turns: CodexSessionTurn[]) => {
  if (turns.length === 0) {
    const created = createTurn(1);
    turns.push(created);
    return created;
  }
  const lastTurn = turns[turns.length - 1];
  if (lastTurn) {
    return lastTurn;
  }
  const fallback = createTurn(1);
  turns.push(fallback);
  return fallback;
};

export const parseCodexSession = (content: string) => {
  const turns: CodexSessionTurn[] = [];
  const callIdToTurn = new Map<string, CodexSessionTurn>();
  const lastMessageByRole = new Map<"user" | "assistant", string>();
  const sessionMeta: CodexSessionMeta = {
    sessionUuid: null,
    cwd: null,
    instructions: null,
    originator: null,
    cliVersion: null,
    timestamp: null,
  };

  const lines = content.split("\n").map((line) => line.trim());
  for (const line of lines) {
    if (!line) {
      continue;
    }

    let parsed: CodexLogLine;
    try {
      parsed = JSON.parse(line) as CodexLogLine;
    } catch {
      continue;
    }

    const timestamp = typeof parsed.timestamp === "string" ? parsed.timestamp : null;

    if (parsed.type === "session_meta" && parsed.payload && typeof parsed.payload === "object") {
      const payload = parsed.payload as {
        id?: unknown;
        cwd?: unknown;
        instructions?: unknown;
        originator?: unknown;
        cli_version?: unknown;
        timestamp?: unknown;
      };
      sessionMeta.sessionUuid = typeof payload.id === "string" ? payload.id : sessionMeta.sessionUuid;
      sessionMeta.cwd = typeof payload.cwd === "string" ? payload.cwd : sessionMeta.cwd;
      sessionMeta.instructions =
        typeof payload.instructions === "string" ? payload.instructions : sessionMeta.instructions;
      sessionMeta.originator = typeof payload.originator === "string" ? payload.originator : sessionMeta.originator;
      sessionMeta.cliVersion = typeof payload.cli_version === "string" ? payload.cli_version : sessionMeta.cliVersion;
      sessionMeta.timestamp =
        typeof payload.timestamp === "string" ? payload.timestamp : (sessionMeta.timestamp ?? timestamp);
      continue;
    }

    if (parsed.type === "response_item") {
      const messagePayload = parseMessagePayload(parsed.payload);
      if (messagePayload) {
        if (lastMessageByRole.get(messagePayload.role) === messagePayload.text) {
          continue;
        }
        const message: CodexMessage = {
          id: createEntryId(messagePayload.role),
          text: messagePayload.text,
          timestamp,
          source: "response_item",
        };
        addMessageToTurn(turns, messagePayload.role, message);
        lastMessageByRole.set(messagePayload.role, messagePayload.text);
        continue;
      }

      const responseType =
        parsed.payload && typeof parsed.payload === "object" ? (parsed.payload as { type?: unknown }).type : null;

      if (responseType === "function_call") {
        const payload = parsed.payload as {
          name?: unknown;
          arguments?: unknown;
          call_id?: unknown;
        };
        const toolCall: CodexToolCall = {
          id: createEntryId("tool-call"),
          name: typeof payload.name === "string" ? payload.name : "unknown",
          arguments:
            typeof payload.arguments === "string"
              ? payload.arguments
              : payload.arguments
                ? JSON.stringify(payload.arguments)
                : null,
          callId: typeof payload.call_id === "string" ? payload.call_id : null,
          timestamp,
        };
        const turn = ensureTurn(turns);
        turn.toolCalls.push(toolCall);
        if (toolCall.callId) {
          callIdToTurn.set(toolCall.callId, turn);
        }
        continue;
      }

      if (responseType === "function_call_output") {
        const payload = parsed.payload as { call_id?: unknown; output?: unknown };
        const toolResult: CodexToolResult = {
          id: createEntryId("tool-result"),
          callId: typeof payload.call_id === "string" ? payload.call_id : null,
          output:
            typeof payload.output === "string"
              ? payload.output
              : payload.output
                ? JSON.stringify(payload.output)
                : null,
          timestamp,
        };
        const mappedTurn = toolResult.callId ? callIdToTurn.get(toolResult.callId) : null;
        const turn = mappedTurn ?? ensureTurn(turns);
        turn.toolResults.push(toolResult);
      }
      continue;
    }

    if (parsed.type === "event_msg" && parsed.payload && typeof parsed.payload === "object") {
      const payload = parsed.payload as { type?: unknown };
      if (payload.type !== "agent_message" && payload.type !== "user_message") {
        continue;
      }

      const role = payload.type === "agent_message" ? "assistant" : "user";
      const text = parseEventMessageText(payload)?.trim();
      if (!text || lastMessageByRole.get(role) === text) {
        continue;
      }

      const message: CodexMessage = {
        id: createEntryId(role),
        text,
        timestamp,
        source: "event_msg",
      };
      addMessageToTurn(turns, role, message);
      lastMessageByRole.set(role, text);
    }
  }

  return {
    turns,
    sessionMeta,
  };
};
