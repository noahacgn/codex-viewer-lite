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

type ResponseMessageRole = "assistant" | "user" | "developer" | "other";

type ParsedResponseMessage = {
  role: ResponseMessageRole;
  text: string;
  isTitleContext: boolean;
  isTimelineHidden: boolean;
};

type TextFragment = {
  startMarker: string;
  endMarker: string;
};

const createEntryId = (() => {
  let counter = 0;
  return (prefix: string) => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
})();

const PERMISSIONS_FRAGMENT: TextFragment = {
  startMarker: "<permissions instructions>",
  endMarker: "</permissions instructions>",
};
const SUBAGENT_NOTIFICATION_FRAGMENT: TextFragment = {
  startMarker: "<subagent_notification>",
  endMarker: "</subagent_notification>",
};
const TITLE_CONTEXT_FRAGMENTS: TextFragment[] = [
  PERMISSIONS_FRAGMENT,
  { startMarker: "# AGENTS.md instructions for ", endMarker: "</INSTRUCTIONS>" },
  { startMarker: "<environment_context>", endMarker: "</environment_context>" },
  { startMarker: "<skill>", endMarker: "</skill>" },
  { startMarker: "<user_shell_command>", endMarker: "</user_shell_command>" },
  { startMarker: "<turn_aborted>", endMarker: "</turn_aborted>" },
  SUBAGENT_NOTIFICATION_FRAGMENT,
];
const HIDDEN_TIMELINE_FRAGMENTS: TextFragment[] = [PERMISSIONS_FRAGMENT, SUBAGENT_NOTIFICATION_FRAGMENT];

const sanitizeInstructionTags = (text: string) => {
  return text
    .replace(/<user_instructions>[\s\S]*?<\/user_instructions>/gi, "")
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, "")
    .replace(/<\/?.*?user_instructions>/gi, "")
    .replace(/<\/?.*?environment_context>/gi, "")
    .trim();
};

const extractTextItems = (value: unknown): string[] => {
  if (typeof value === "string") {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }

  const texts: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      texts.push(item);
      continue;
    }
    if (!item || typeof item !== "object") {
      continue;
    }
    const itemText = (item as { text?: unknown }).text;
    if (typeof itemText === "string") {
      texts.push(itemText);
    }
  }

  return texts;
};

const extractTextFromUnknown = (value: unknown): string => {
  const texts = extractTextItems(value)
    .map((text) => sanitizeInstructionTags(text))
    .filter(Boolean);
  return texts.join("\n\n").trim();
};

const matchesFragment = (text: string, fragment: TextFragment) => {
  const trimmedStart = text.trimStart();
  const startsWithMarker =
    trimmedStart
      .slice(0, fragment.startMarker.length)
      .localeCompare(fragment.startMarker, undefined, { sensitivity: "accent" }) === 0;
  if (!startsWithMarker) {
    return false;
  }

  const trimmedEnd = text.trimEnd();
  return (
    trimmedEnd
      .slice(-fragment.endMarker.length)
      .localeCompare(fragment.endMarker, undefined, { sensitivity: "accent" }) === 0
  );
};

const hasMatchingFragment = (value: unknown, fragments: TextFragment[]) => {
  return extractTextItems(value).some((text) => fragments.some((fragment) => matchesFragment(text, fragment)));
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

const parseResponseMessageRole = (value: unknown): ResponseMessageRole => {
  if (value === "assistant" || value === "user" || value === "developer") {
    return value;
  }
  return "other";
};

const parseMessagePayload = (payload: unknown): ParsedResponseMessage | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if ((payload as { type?: unknown }).type !== "message") {
    return null;
  }
  const content = (payload as { content?: unknown }).content;
  return {
    role: parseResponseMessageRole((payload as { role?: unknown }).role),
    text: extractTextFromUnknown(content).trim(),
    isTitleContext: hasMatchingFragment(content, TITLE_CONTEXT_FRAGMENTS),
    isTimelineHidden: hasMatchingFragment(content, HIDDEN_TIMELINE_FRAGMENTS),
  };
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

const addVisibleMessage = (
  turns: CodexSessionTurn[],
  lastMessageByRole: Map<"user" | "assistant", string>,
  role: "user" | "assistant",
  text: string,
  timestamp: string | null,
  source: CodexMessage["source"],
) => {
  if (lastMessageByRole.get(role) === text) {
    return;
  }

  const message: CodexMessage = {
    id: createEntryId(role),
    text,
    timestamp,
    source,
  };
  addMessageToTurn(turns, role, message);
  lastMessageByRole.set(role, text);
};

const getTitleCandidate = (message: ParsedResponseMessage) => {
  if (message.role !== "user" || message.isTitleContext || !message.text) {
    return null;
  }
  return message.text;
};

const extractFirstUserMessageFromHistory = (history: unknown) => {
  if (!Array.isArray(history)) {
    return null;
  }

  for (const item of history) {
    const message = parseMessagePayload(item);
    if (!message) {
      continue;
    }
    const titleCandidate = getTitleCandidate(message);
    if (titleCandidate) {
      return titleCandidate;
    }
  }

  return null;
};

const applySessionMetaPayload = (
  sessionMeta: CodexSessionMeta,
  payload: {
    id?: unknown;
    cwd?: unknown;
    instructions?: unknown;
    originator?: unknown;
    cli_version?: unknown;
    timestamp?: unknown;
  },
  timestamp: string | null,
) => {
  sessionMeta.sessionUuid = typeof payload.id === "string" ? payload.id : sessionMeta.sessionUuid;
  sessionMeta.cwd = typeof payload.cwd === "string" ? payload.cwd : sessionMeta.cwd;
  sessionMeta.instructions = typeof payload.instructions === "string" ? payload.instructions : sessionMeta.instructions;
  sessionMeta.originator = typeof payload.originator === "string" ? payload.originator : sessionMeta.originator;
  sessionMeta.cliVersion = typeof payload.cli_version === "string" ? payload.cli_version : sessionMeta.cliVersion;
  sessionMeta.timestamp =
    typeof payload.timestamp === "string" ? payload.timestamp : (sessionMeta.timestamp ?? timestamp);
};

export const parseCodexSession = (content: string) => {
  const turns: CodexSessionTurn[] = [];
  const callIdToTurn = new Map<string, CodexSessionTurn>();
  const lastMessageByRole = new Map<"user" | "assistant", string>();
  let firstUserMessage: string | null = null;
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
      applySessionMetaPayload(
        sessionMeta,
        parsed.payload as {
          id?: unknown;
          cwd?: unknown;
          instructions?: unknown;
          originator?: unknown;
          cli_version?: unknown;
          timestamp?: unknown;
        },
        timestamp,
      );
      continue;
    }

    if (!firstUserMessage && parsed.type === "compacted" && parsed.payload && typeof parsed.payload === "object") {
      firstUserMessage =
        extractFirstUserMessageFromHistory((parsed.payload as { replacement_history?: unknown }).replacement_history) ??
        firstUserMessage;
      continue;
    }

    if (parsed.type === "response_item") {
      const messagePayload = parseMessagePayload(parsed.payload);
      if (messagePayload) {
        firstUserMessage = firstUserMessage ?? getTitleCandidate(messagePayload);
        if (
          (messagePayload.role === "user" || messagePayload.role === "assistant") &&
          messagePayload.text &&
          !messagePayload.isTimelineHidden
        ) {
          addVisibleMessage(
            turns,
            lastMessageByRole,
            messagePayload.role,
            messagePayload.text,
            timestamp,
            "response_item",
          );
        }
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
      if (!text || hasMatchingFragment([text], HIDDEN_TIMELINE_FRAGMENTS)) {
        continue;
      }
      addVisibleMessage(turns, lastMessageByRole, role, text, timestamp, "event_msg");
    }
  }

  return {
    firstUserMessage,
    turns,
    sessionMeta,
  };
};
