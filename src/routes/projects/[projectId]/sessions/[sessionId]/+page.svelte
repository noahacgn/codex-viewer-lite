<script lang="ts">
import { onDestroy, onMount, tick } from "svelte";
import MarkdownRenderer from "$lib/components/MarkdownRenderer.svelte";
import { locale, t } from "$lib/i18n/store";
import type { CodexMessage } from "$lib/shared/types";
import type { PageData } from "./$types";

let { data }: { data: PageData } = $props();
type MessageCopyState = "idle" | "copied";

let copyStates = $state<Record<string, MessageCopyState>>({});
const copyResetTimers = new Map<string, ReturnType<typeof setTimeout>>();
const NEAR_BOTTOM_THRESHOLD_PX = 160;

let followLatest = $state(true);
let hasPendingLatest = $state(false);
let lastSessionRevision = $state("");
let chatStartAnchor = $state<HTMLDivElement | null>(null);
let chatEndAnchor = $state<HTMLDivElement | null>(null);
let isMounted = false;

const formatDate = (iso: string | null) => {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleString($locale);
};

const sessionTitle = () => {
  const firstUserMessage = data.session.meta.firstUserMessage;
  if (!firstUserMessage) {
    return data.session.jsonlFilePath.split(/[\\/]/).at(-1) ?? data.session.id;
  }
  return firstUserMessage.length > 120 ? `${firstUserMessage.slice(0, 120)}...` : firstUserMessage;
};

const clearCopyTimer = (messageId: string) => {
  const existingTimer = copyResetTimers.get(messageId);
  if (!existingTimer) {
    return;
  }
  clearTimeout(existingTimer);
  copyResetTimers.delete(messageId);
};

const copyMessage = async (messageId: string, text: string) => {
  clearCopyTimer(messageId);
  try {
    await navigator.clipboard.writeText(text);
    copyStates[messageId] = "copied";
    const timer = setTimeout(() => {
      copyStates[messageId] = "idle";
      copyResetTimers.delete(messageId);
    }, 2000);
    copyResetTimers.set(messageId, timer);
  } catch (error) {
    console.error("Failed to copy message text", { messageId, error });
  }
};

const copyLabel = (messageId: string) => {
  return copyStates[messageId] === "copied" ? t("session.copied", $locale) : t("session.copy", $locale);
};

const isSubagentMessage = (message: CodexMessage) => {
  return message.kind === "subagent_prompt" || message.kind === "subagent_response";
};

const messageRowClass = (message: CodexMessage) => {
  if (message.kind === "user") {
    return "chat-row user";
  }
  if (message.kind === "subagent_prompt") {
    return "chat-row subagent-prompt";
  }
  if (message.kind === "subagent_response") {
    const errorClass = message.status === "errored" ? " errored" : "";
    return `chat-row subagent-response${errorClass}`;
  }
  return "chat-row";
};

const messageBubbleClass = () => {
  return "chat-bubble";
};

const subagentLabel = (message: CodexMessage) => {
  return message.kind === "subagent_prompt"
    ? t("session.subagentPrompt", $locale)
    : t("session.subagentResponse", $locale);
};

const subagentStatusLabel = (message: CodexMessage) => {
  if (message.status === "completed") {
    return t("session.subagentCompleted", $locale);
  }
  if (message.status === "errored") {
    return t("session.subagentErrored", $locale);
  }
  return null;
};

const subagentAgentName = (message: CodexMessage) => {
  if (message.agentNickname && message.agentId) {
    return `${message.agentNickname} · ${message.agentId}`;
  }
  return message.agentNickname ?? message.agentId ?? t("session.subagentUnknown", $locale);
};

const getSessionRevision = () => {
  return `${data.session.meta.lastModifiedAt ?? "null"}:${data.session.meta.messageCount}`;
};

const isReducedMotion = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

const resolveScrollBehavior = (requested: ScrollBehavior): ScrollBehavior => {
  return requested === "smooth" && isReducedMotion() ? "auto" : requested;
};

const scrollToAnchor = (anchor: HTMLDivElement | null, behavior: ScrollBehavior, block: ScrollLogicalPosition) => {
  if (!anchor) {
    return;
  }

  anchor.scrollIntoView({
    behavior: resolveScrollBehavior(behavior),
    block,
  });
};

const scrollToLatest = (behavior: ScrollBehavior) => {
  scrollToAnchor(chatEndAnchor, behavior, "end");
};

const scrollToChatTop = (behavior: ScrollBehavior) => {
  scrollToAnchor(chatStartAnchor, behavior, "start");
};

const getBottomGap = () => {
  if (typeof window === "undefined") {
    return Number.POSITIVE_INFINITY;
  }

  const doc = document.documentElement;
  return Math.max(0, doc.scrollHeight - (window.scrollY + window.innerHeight));
};

const isNearBottom = () => {
  return getBottomGap() <= NEAR_BOTTOM_THRESHOLD_PX;
};

const handleWindowScroll = () => {
  const nearBottom = isNearBottom();
  followLatest = nearBottom;
  if (nearBottom && hasPendingLatest) {
    hasPendingLatest = false;
  }
};

const syncScrollOnRevisionChange = async () => {
  await tick();
  if (followLatest) {
    scrollToLatest("auto");
    hasPendingLatest = false;
    return;
  }
  hasPendingLatest = true;
};

const jumpToTop = () => {
  followLatest = false;
  scrollToChatTop("smooth");
};

const jumpToLatest = () => {
  scrollToLatest("smooth");
  followLatest = true;
  hasPendingLatest = false;
};

const waitForNextFrame = async () => {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
};

onMount(() => {
  lastSessionRevision = getSessionRevision();

  const initializeScroll = async () => {
    await tick();
    scrollToLatest("auto");
    await waitForNextFrame();
    await waitForNextFrame();
    scrollToLatest("auto");
    followLatest = isNearBottom();
    hasPendingLatest = false;
    isMounted = true;
  };

  window.addEventListener("scroll", handleWindowScroll, { passive: true });
  void initializeScroll();

  return () => {
    window.removeEventListener("scroll", handleWindowScroll);
  };
});

$effect(() => {
  const revision = getSessionRevision();
  if (!isMounted) {
    lastSessionRevision = revision;
    return;
  }

  if (revision === lastSessionRevision) {
    return;
  }

  lastSessionRevision = revision;
  void syncScrollOnRevisionChange();
});

onDestroy(() => {
  for (const timer of copyResetTimers.values()) {
    clearTimeout(timer);
  }
  copyResetTimers.clear();
});
</script>

<section class="card" style="padding:1rem; margin-bottom:0.9rem;">
  <div class="toolbar" style="justify-content:space-between; align-items:center;">
    <div style="display:flex; flex-direction:column; gap:0.3rem;">
      <h1 style="margin:0;">{t("session.title", $locale)}</h1>
      <strong>{sessionTitle()}</strong>
    </div>
    <a class="button" data-testid="back-session-list" href={`/projects/${data.projectId}`}>
      {t("common.backSessionList", $locale)}
    </a>
  </div>
  <div class="meta-row" style="margin-top:0.65rem;">
    <span>{t("session.workspace", $locale)}:</span>
    <span class="mono">{data.session.sessionMeta.cwd ?? "—"}</span>
  </div>
  <div class="meta-row">
    <span>{t("session.sessionId", $locale)}:</span>
    <span class="mono">{data.session.sessionUuid ?? data.session.id}</span>
  </div>
</section>

{#if data.session.sessionMeta.instructions}
  <section class="card" style="padding:0.9rem; margin-bottom:0.9rem;">
    <strong>{t("session.instructions", $locale)}</strong>
    <pre class="mono" style="white-space:pre-wrap; margin:0.6rem 0 0; font-size:0.85rem;">
{data.session.sessionMeta.instructions}
    </pre>
  </section>
{/if}

<section class="card session-chat-card" style="padding:1rem;">
  <div class="chat-anchor" bind:this={chatStartAnchor} data-testid="chat-start-anchor" aria-hidden="true"></div>
  {#if data.session.turns.length === 0}
    <div class="card" style="padding:1rem; background:var(--surface-weak);">
      {t("session.noMessages", $locale)}
    </div>
  {:else}
    <div class="chat-list">
      {#each data.session.turns as turn (turn.id)}
        {#each turn.messages as message (message.id)}
          <article class={messageRowClass(message)}>
            <div class={messageBubbleClass()}>
              {#if isSubagentMessage(message)}
                <div class="chat-label-row">
                  <span class="chat-label-chip">{subagentLabel(message)}</span>
                  <span class="chat-label-chip mono" title={subagentAgentName(message)}>
                    {subagentAgentName(message)}
                  </span>
                  {#if subagentStatusLabel(message)}
                    <span
                      class={`chat-label-chip ${
                        message.status === "completed"
                          ? "status-completed"
                          : message.status === "errored"
                            ? "status-errored"
                            : ""
                      }`}
                    >
                      {subagentStatusLabel(message)}
                    </span>
                  {/if}
                </div>
              {/if}
              <MarkdownRenderer content={message.text} />
              <div class="chat-meta-row">
                <div class="chat-time">{formatDate(message.timestamp)}</div>
                <button
                  type="button"
                  class={`chat-copy-button ${copyStates[message.id] === "copied" ? "copied" : ""}`}
                  onclick={() => void copyMessage(message.id, message.text)}
                >
                  {copyLabel(message.id)}
                </button>
              </div>
            </div>
          </article>
        {/each}

        {#if turn.toolCalls.length > 0}
          <article class="chat-row">
            <div class="chat-bubble">
              <details class="tool-group">
                <summary class="tool-summary">{t("session.toolUse", $locale)} ({turn.toolCalls.length})</summary>
                {#each turn.toolCalls as call (call.id)}
                  <div class="tool-card">
                    <div><strong>{call.name}</strong></div>
                    {#if call.arguments}
                      <pre class="mono" style="white-space:pre-wrap; margin:0.4rem 0 0;">{call.arguments}</pre>
                    {/if}
                  </div>
                {/each}
              </details>
            </div>
          </article>
        {/if}

        {#if turn.toolResults.length > 0}
          <article class="chat-row">
            <div class="chat-bubble">
              <details class="tool-group">
                <summary class="tool-summary">
                  {t("session.toolResult", $locale)} ({turn.toolResults.length})
                </summary>
                {#each turn.toolResults as result (result.id)}
                  <div class="tool-card">
                    <pre class="mono" style="white-space:pre-wrap; margin:0;">{result.output ?? "null"}</pre>
                  </div>
                {/each}
              </details>
            </div>
          </article>
        {/if}
      {/each}
    </div>
  {/if}
  <div class="chat-anchor" bind:this={chatEndAnchor} data-testid="chat-end-anchor" aria-hidden="true"></div>
</section>

<div class="chat-jump-controls">
  <button
    type="button"
    class="chat-jump-button"
    data-testid="jump-top"
    aria-label={t("session.jumpTop", $locale)}
    onclick={jumpToTop}
  >
    {t("session.jumpTop", $locale)}
  </button>
  <button
    type="button"
    class={`chat-jump-button ${hasPendingLatest ? "pending-latest" : ""}`}
    data-testid="jump-latest"
    aria-label={t("session.jumpLatest", $locale)}
    onclick={jumpToLatest}
  >
    {t("session.jumpLatest", $locale)}
  </button>
</div>
