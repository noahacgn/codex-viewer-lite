export type CodexMessage = {
  id: string;
  kind: "user" | "assistant" | "subagent_prompt" | "subagent_response" | "user_input_request" | "user_input_response";
  text: string;
  timestamp: string | null;
  source: "response_item" | "event_msg";
  agentId: string | null;
  agentNickname: string | null;
  status: "completed" | "errored" | "updated" | null;
};

export type CodexToolCall = {
  id: string;
  name: string;
  arguments: string | null;
  callId: string | null;
  timestamp: string | null;
};

export type CodexToolResult = {
  id: string;
  callId: string | null;
  output: string | null;
  timestamp: string | null;
};

export type CodexReasoning = {
  id: string;
  summary: string | null;
  text: string | null;
  timestamp: string | null;
  encrypted: boolean;
};

export type CodexSessionTurn = {
  id: string;
  messages: CodexMessage[];
  reasonings: CodexReasoning[];
  toolCalls: CodexToolCall[];
  toolResults: CodexToolResult[];
};

export type CodexSessionMeta = {
  sessionUuid: string | null;
  cwd: string | null;
  instructions: string | null;
  originator: string | null;
  cliVersion: string | null;
  timestamp: string | null;
};

export type SessionMeta = {
  messageCount: number;
  lastModifiedAt: string | null;
  startedAt: string | null;
  firstUserMessage: string | null;
};

export type Session = {
  id: string;
  sessionUuid: string | null;
  jsonlFilePath: string;
  meta: SessionMeta;
};

export type SessionContextSnapshot = {
  remainingPercent: number | null;
  usedPercent: number | null;
  totalTokens: number | null;
  modelContextWindow: number | null;
  timestamp: string | null;
  source: "token_count" | "turn_started";
};

export type SessionDetail = Session & {
  turns: CodexSessionTurn[];
  sessionMeta: CodexSessionMeta;
  latestContext: SessionContextSnapshot | null;
};

export type ProjectMeta = {
  workspaceName: string;
  workspacePath: string;
  lastSessionAt: string | null;
  sessionCount: number;
};

export type Project = {
  id: string;
  workspacePath: string;
  meta: ProjectMeta;
};

export type CodexReconnectSource = "codex-tui.log";

export type CodexReconnectEventData = {
  message: string;
  source: CodexReconnectSource;
};

export type SseEvent =
  | {
      type: "connected";
      id: string;
      timestamp: string;
      message: string;
    }
  | {
      type: "heartbeat";
      id: string;
      timestamp: string;
    }
  | {
      type: "project_changed";
      id: string;
      timestamp: string;
      data: {
        projectId: string | null;
        fileEventType: string;
      };
    }
  | {
      type: "session_changed";
      id: string;
      timestamp: string;
      data: {
        projectId: string | null;
        sessionId: string | null;
        fileEventType: string;
      };
    }
  | {
      type: "codex_reconnect_detected";
      id: string;
      timestamp: string;
      data: CodexReconnectEventData;
    };
