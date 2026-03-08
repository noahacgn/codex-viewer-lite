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

type TextFragment = {
  startMarker: string;
  endMarker: string;
};

type ParsedSubagentNotification = {
  agentId: string | null;
  status: CodexMessage["status"];
  text: string | null;
};

type ParsedResponseMessage = {
  role: ResponseMessageRole;
  text: string;
  isTitleContext: boolean;
  isTimelineHidden: boolean;
  subagentNotification: ParsedSubagentNotification | null;
};

type RequestUserInputOption = {
  label: string;
  description: string | null;
};

type RequestUserInputQuestion = {
  id: string;
  header: string | null;
  question: string;
  options: RequestUserInputOption[];
};

type PendingRequestUserInput = {
  questions: RequestUserInputQuestion[];
  toolCallId: string;
  toolTurn: CodexSessionTurn;
};

type ParseState = {
  turns: CodexSessionTurn[];
  callIdToTurn: Map<string, CodexSessionTurn>;
  callIdToSubagentPrompt: Map<string, CodexMessage>;
  pendingRequestUserInputs: Map<string, PendingRequestUserInput>;
  agentNicknameById: Map<string, string>;
  lastConversationMessageByKind: Map<"user" | "assistant", string>;
  firstUserMessage: string | null;
  sessionMeta: CodexSessionMeta;
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
const HIDDEN_TIMELINE_FRAGMENTS: TextFragment[] = [PERMISSIONS_FRAGMENT];

const createTurn = (index: number): CodexSessionTurn => {
  return {
    id: `turn-${index}`,
    messages: [],
    reasonings: [],
    toolCalls: [],
    toolResults: [],
  };
};

const createEmptySessionMeta = (): CodexSessionMeta => {
  return {
    sessionUuid: null,
    cwd: null,
    instructions: null,
    originator: null,
    cliVersion: null,
    timestamp: null,
  };
};

const createParseState = (): ParseState => {
  return {
    turns: [],
    callIdToTurn: new Map<string, CodexSessionTurn>(),
    callIdToSubagentPrompt: new Map<string, CodexMessage>(),
    pendingRequestUserInputs: new Map<string, PendingRequestUserInput>(),
    agentNicknameById: new Map<string, string>(),
    lastConversationMessageByKind: new Map<"user" | "assistant", string>(),
    firstUserMessage: null,
    sessionMeta: createEmptySessionMeta(),
  };
};

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

const extractFragmentBody = (text: string, fragment: TextFragment) => {
  if (!matchesFragment(text, fragment)) {
    return null;
  }

  const trimmed = text.trim();
  const startIndex = fragment.startMarker.length;
  const endIndex = trimmed.length - fragment.endMarker.length;
  return trimmed.slice(startIndex, endIndex).trim();
};

const parseObjectValue = (value: unknown) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {}

  return null;
};

const serializeUnknownValue = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return null;
  }
  return JSON.stringify(value);
};

const readNonEmptyString = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = sanitizeInstructionTags(value).trim();
  return normalized || null;
};

const readStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseSubagentStatus = (status: unknown) => {
  if (status && typeof status === "object" && !Array.isArray(status)) {
    const completed = (status as { completed?: unknown }).completed;
    if (typeof completed === "string" && completed.trim()) {
      return { status: "completed" as const, text: sanitizeInstructionTags(completed).trim() };
    }

    const errored = (status as { errored?: unknown }).errored;
    if (typeof errored === "string" && errored.trim()) {
      return { status: "errored" as const, text: sanitizeInstructionTags(errored).trim() };
    }
  }

  if (typeof status === "string" && status.trim()) {
    return { status: "updated" as const, text: status.trim() };
  }

  const serialized = serializeUnknownValue(status);
  return { status: "updated" as const, text: serialized?.trim() ?? null };
};

const parseSubagentNotification = (value: unknown): ParsedSubagentNotification | null => {
  for (const text of extractTextItems(value)) {
    const wrapped = extractFragmentBody(text, SUBAGENT_NOTIFICATION_FRAGMENT);
    if (!wrapped) {
      continue;
    }

    const payload = parseObjectValue(wrapped);
    const statusInfo = parseSubagentStatus(payload?.status ?? null);
    return {
      agentId: typeof payload?.agent_id === "string" ? payload.agent_id : null,
      status: statusInfo.status,
      text: statusInfo.text,
    };
  }

  return null;
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
    subagentNotification: parseSubagentNotification(content),
  };
};

const parseRequestUserInputQuestions = (argumentsValue: unknown) => {
  const payload = parseObjectValue(argumentsValue);
  if (!payload || !Array.isArray(payload.questions)) {
    return null;
  }

  const questions: RequestUserInputQuestion[] = [];
  for (const item of payload.questions) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const question = readNonEmptyString((item as { question?: unknown }).question);
    const id = readNonEmptyString((item as { id?: unknown }).id);
    if (!question || !id) {
      continue;
    }

    const options = Array.isArray((item as { options?: unknown }).options)
      ? ((item as { options?: unknown }).options as unknown[])
          .filter((option) => option && typeof option === "object" && !Array.isArray(option))
          .map((option) => {
            return {
              label: readNonEmptyString((option as { label?: unknown }).label) ?? "Unknown option",
              description: readNonEmptyString((option as { description?: unknown }).description),
            } satisfies RequestUserInputOption;
          })
      : [];

    questions.push({
      id,
      header: readNonEmptyString((item as { header?: unknown }).header),
      question,
      options,
    });
  }

  return questions.length > 0 ? questions : null;
};

const formatRequestUserInputQuestions = (questions: RequestUserInputQuestion[]) => {
  return questions
    .map((question) => {
      const title = question.header ?? question.question;
      const optionLines = question.options.map((option) => {
        return option.description ? `- ${option.label}: ${option.description}` : `- ${option.label}`;
      });
      return [`### ${title}`, question.header ? question.question : null, ...optionLines].filter(Boolean).join("\n\n");
    })
    .join("\n\n");
};

const splitUserInputAnswers = (answers: string[]) => {
  const selections: string[] = [];
  const notes: string[] = [];
  for (const answer of answers) {
    if (answer.startsWith("user_note:")) {
      const note = answer.slice("user_note:".length).trim();
      if (note) {
        notes.push(note);
      }
      continue;
    }
    selections.push(answer);
  }
  return { selections, notes };
};

const formatRequestUserInputAnswers = (questions: RequestUserInputQuestion[], outputValue: unknown) => {
  const payload = parseObjectValue(outputValue);
  const answersValue = payload?.answers;
  if (!answersValue || typeof answersValue !== "object" || Array.isArray(answersValue)) {
    return null;
  }

  const answers = answersValue as Record<string, unknown>;
  const sections: string[] = [];
  const seenIds = new Set<string>();

  for (const question of questions) {
    const entry = parseObjectValue(answers[question.id]);
    const answerList = readStringArray(entry?.answers);
    if (answerList.length === 0) {
      continue;
    }

    seenIds.add(question.id);
    const { selections, notes } = splitUserInputAnswers(answerList);
    const lines = [
      `### ${question.header ?? question.question}`,
      ...selections.map((selection) => `- ${selection}`),
      ...notes.map((note) => `Note: ${note}`),
    ];
    sections.push(lines.join("\n"));
  }

  for (const [questionId, value] of Object.entries(answers)) {
    if (seenIds.has(questionId)) {
      continue;
    }

    const entry = parseObjectValue(value);
    const answerList = readStringArray(entry?.answers);
    if (answerList.length === 0) {
      continue;
    }

    const { selections, notes } = splitUserInputAnswers(answerList);
    const lines = [
      `### ${questionId}`,
      ...selections.map((selection) => `- ${selection}`),
      ...notes.map((note) => `Note: ${note}`),
    ];
    sections.push(lines.join("\n"));
  }

  return sections.length > 0 ? sections.join("\n\n") : null;
};

const createMessage = (
  kind: CodexMessage["kind"],
  text: string,
  timestamp: string | null,
  source: CodexMessage["source"],
  metadata?: {
    agentId?: string | null;
    agentNickname?: string | null;
    status?: CodexMessage["status"];
  },
): CodexMessage => {
  return {
    id: createEntryId("message"),
    kind,
    text,
    timestamp,
    source,
    agentId: metadata?.agentId ?? null,
    agentNickname: metadata?.agentNickname ?? null,
    status: metadata?.status ?? null,
  };
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

const lastTurnHasUserMessage = (turn: CodexSessionTurn) => {
  return turn.messages.some((message) => message.kind === "user");
};

const pushTurnMessage = (turns: CodexSessionTurn[], message: CodexMessage) => {
  const turn = ensureTurn(turns);
  turn.messages.push(message);
  return turn;
};

const pushConversationMessage = (
  state: ParseState,
  role: "user" | "assistant",
  text: string,
  timestamp: string | null,
  source: CodexMessage["source"],
) => {
  if (state.lastConversationMessageByKind.get(role) === text) {
    return;
  }

  const message = createMessage(role, text, timestamp, source);
  if (role === "user") {
    const turn = ensureTurn(state.turns);
    if (lastTurnHasUserMessage(turn)) {
      const nextTurn = createTurn(state.turns.length + 1);
      nextTurn.messages.push(message);
      state.turns.push(nextTurn);
    } else {
      turn.messages.push(message);
    }
  } else {
    pushTurnMessage(state.turns, message);
  }

  state.lastConversationMessageByKind.set(role, text);
};

const pushSubagentPrompt = (state: ParseState, text: string, timestamp: string | null, callId: string | null) => {
  const message = createMessage("subagent_prompt", text, timestamp, "response_item");
  pushTurnMessage(state.turns, message);
  if (callId) {
    state.callIdToSubagentPrompt.set(callId, message);
  }
};

const pushRequestUserInputMessage = (
  state: ParseState,
  kind: "user_input_request" | "user_input_response",
  text: string,
  timestamp: string | null,
) => {
  const message = createMessage(kind, text, timestamp, "response_item");
  pushTurnMessage(state.turns, message);
  return message;
};

const pushSubagentResponse = (
  state: ParseState,
  notification: ParsedSubagentNotification,
  timestamp: string | null,
) => {
  if (!notification.text) {
    return;
  }

  const message = createMessage("subagent_response", notification.text, timestamp, "response_item", {
    agentId: notification.agentId,
    agentNickname: notification.agentId ? (state.agentNicknameById.get(notification.agentId) ?? null) : null,
    status: notification.status,
  });
  pushTurnMessage(state.turns, message);
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

const handleResponseMessage = (state: ParseState, messagePayload: ParsedResponseMessage, timestamp: string | null) => {
  state.firstUserMessage = state.firstUserMessage ?? getTitleCandidate(messagePayload);
  if (messagePayload.subagentNotification) {
    pushSubagentResponse(state, messagePayload.subagentNotification, timestamp);
    return;
  }

  if (
    (messagePayload.role !== "user" && messagePayload.role !== "assistant") ||
    !messagePayload.text ||
    messagePayload.isTimelineHidden
  ) {
    return;
  }

  pushConversationMessage(state, messagePayload.role, messagePayload.text, timestamp, "response_item");
};

const extractSpawnAgentText = (argumentsValue: unknown) => {
  const payload = parseObjectValue(argumentsValue);
  if (!payload) {
    return null;
  }

  const message = payload.message;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  const itemsText = extractTextFromUnknown(payload.items).trim();
  return itemsText || null;
};

const addGenericToolCall = (
  state: ParseState,
  name: string,
  argumentsValue: unknown,
  callId: string | null,
  timestamp: string | null,
) => {
  const toolCall: CodexToolCall = {
    id: createEntryId("tool-call"),
    name,
    arguments: serializeUnknownValue(argumentsValue),
    callId,
    timestamp,
  };
  const turn = ensureTurn(state.turns);
  turn.toolCalls.push(toolCall);
  if (callId) {
    state.callIdToTurn.set(callId, turn);
  }
  return { toolCall, turn };
};

const hideToolCall = (turn: CodexSessionTurn, toolCallId: string) => {
  turn.toolCalls = turn.toolCalls.filter((toolCall) => toolCall.id !== toolCallId);
};

const handleFunctionCall = (
  state: ParseState,
  payload: { name?: unknown; arguments?: unknown; call_id?: unknown },
  timestamp: string | null,
) => {
  const name = typeof payload.name === "string" ? payload.name : "unknown";
  const callId = typeof payload.call_id === "string" ? payload.call_id : null;
  if (name === "spawn_agent") {
    const promptText = extractSpawnAgentText(payload.arguments);
    if (promptText) {
      pushSubagentPrompt(state, promptText, timestamp, callId);
      return;
    }
  }

  const toolCallEntry = addGenericToolCall(state, name, payload.arguments, callId, timestamp);
  if (name !== "request_user_input") {
    return;
  }

  const questions = parseRequestUserInputQuestions(payload.arguments);
  if (!questions) {
    return;
  }

  const formattedQuestions = formatRequestUserInputQuestions(questions);
  pushRequestUserInputMessage(state, "user_input_request", formattedQuestions, timestamp);
  if (!callId) {
    return;
  }

  state.pendingRequestUserInputs.set(callId, {
    questions,
    toolCallId: toolCallEntry.toolCall.id,
    toolTurn: toolCallEntry.turn,
  });
};

const enrichSubagentPrompt = (state: ParseState, callId: string | null, outputValue: unknown) => {
  if (!callId) {
    return false;
  }

  const prompt = state.callIdToSubagentPrompt.get(callId);
  if (!prompt) {
    return false;
  }

  const payload = parseObjectValue(outputValue);
  prompt.agentId = typeof payload?.agent_id === "string" ? payload.agent_id : prompt.agentId;
  prompt.agentNickname = typeof payload?.nickname === "string" ? payload.nickname : prompt.agentNickname;
  if (prompt.agentId && prompt.agentNickname) {
    state.agentNicknameById.set(prompt.agentId, prompt.agentNickname);
  }
  return true;
};

const handleRequestUserInputResult = (
  state: ParseState,
  callId: string | null,
  outputValue: unknown,
  timestamp: string | null,
) => {
  if (!callId) {
    return false;
  }

  const pending = state.pendingRequestUserInputs.get(callId);
  if (!pending) {
    return false;
  }

  const formattedAnswers = formatRequestUserInputAnswers(pending.questions, outputValue);
  if (!formattedAnswers) {
    return false;
  }

  hideToolCall(pending.toolTurn, pending.toolCallId);
  pushRequestUserInputMessage(state, "user_input_response", formattedAnswers, timestamp);
  state.pendingRequestUserInputs.delete(callId);
  return true;
};

const handleFunctionCallOutput = (
  state: ParseState,
  payload: { call_id?: unknown; output?: unknown },
  timestamp: string | null,
) => {
  const callId = typeof payload.call_id === "string" ? payload.call_id : null;
  if (enrichSubagentPrompt(state, callId, payload.output)) {
    return;
  }
  if (handleRequestUserInputResult(state, callId, payload.output, timestamp)) {
    return;
  }

  const toolResult: CodexToolResult = {
    id: createEntryId("tool-result"),
    callId,
    output: serializeUnknownValue(payload.output),
    timestamp,
  };
  const mappedTurn = callId ? state.callIdToTurn.get(callId) : null;
  const turn = mappedTurn ?? ensureTurn(state.turns);
  turn.toolResults.push(toolResult);
};

const handleEventMessage = (
  state: ParseState,
  payload: { type?: unknown; text?: unknown; message?: unknown },
  timestamp: string | null,
) => {
  if (payload.type !== "agent_message" && payload.type !== "user_message") {
    return;
  }

  const text = parseEventMessageText(payload)?.trim();
  if (!text || hasMatchingFragment([text], HIDDEN_TIMELINE_FRAGMENTS)) {
    return;
  }
  if (matchesFragment(text, SUBAGENT_NOTIFICATION_FRAGMENT)) {
    return;
  }

  const role = payload.type === "agent_message" ? "assistant" : "user";
  pushConversationMessage(state, role, text, timestamp, "event_msg");
};

const handleResponseItem = (state: ParseState, payload: unknown, timestamp: string | null) => {
  const messagePayload = parseMessagePayload(payload);
  if (messagePayload) {
    handleResponseMessage(state, messagePayload, timestamp);
    return;
  }

  const responseType = payload && typeof payload === "object" ? (payload as { type?: unknown }).type : null;
  if (responseType === "function_call") {
    handleFunctionCall(state, payload as { name?: unknown; arguments?: unknown; call_id?: unknown }, timestamp);
    return;
  }

  if (responseType === "function_call_output") {
    handleFunctionCallOutput(state, payload as { call_id?: unknown; output?: unknown }, timestamp);
  }
};

export const parseCodexSession = (content: string) => {
  const state = createParseState();
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
        state.sessionMeta,
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

    if (
      !state.firstUserMessage &&
      parsed.type === "compacted" &&
      parsed.payload &&
      typeof parsed.payload === "object"
    ) {
      state.firstUserMessage =
        extractFirstUserMessageFromHistory((parsed.payload as { replacement_history?: unknown }).replacement_history) ??
        state.firstUserMessage;
      continue;
    }

    if (parsed.type === "response_item") {
      handleResponseItem(state, parsed.payload, timestamp);
      continue;
    }

    if (parsed.type === "event_msg" && parsed.payload && typeof parsed.payload === "object") {
      handleEventMessage(state, parsed.payload as { type?: unknown; text?: unknown; message?: unknown }, timestamp);
    }
  }

  return {
    firstUserMessage: state.firstUserMessage,
    turns: state.turns,
    sessionMeta: state.sessionMeta,
  };
};
