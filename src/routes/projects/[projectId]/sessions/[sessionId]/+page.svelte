<script lang="ts">
import MarkdownRenderer from "$lib/components/MarkdownRenderer.svelte";
import { locale, t } from "$lib/i18n/store";
import type { PageData } from "./$types";

let { data }: { data: PageData } = $props();

const formatDate = (iso: string | null) => {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleString($locale);
};

const sessionTitle = () => {
  const firstUser = data.session.turns.find((turn) => turn.userMessage)?.userMessage;
  if (!firstUser?.text) {
    return data.session.id;
  }
  return firstUser.text.length > 120 ? `${firstUser.text.slice(0, 120)}...` : firstUser.text;
};
</script>

<section class="card" style="padding:1rem; margin-bottom:0.9rem;">
  <div class="toolbar" style="justify-content:space-between; align-items:center;">
    <div style="display:flex; flex-direction:column; gap:0.3rem;">
      <h1 style="margin:0;">{t("session.title", $locale)}</h1>
      <strong>{sessionTitle()}</strong>
    </div>
    <a class="button" href={`/projects/${data.projectId}`}>{t("common.backProjects", $locale)}</a>
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

<section class="card" style="padding:1rem;">
  {#if data.session.turns.length === 0}
    <div class="card" style="padding:1rem; background:var(--surface-weak);">
      {t("session.noMessages", $locale)}
    </div>
  {:else}
    <div class="chat-list">
      {#each data.session.turns as turn (turn.id)}
        {#if turn.userMessage}
          <article class="chat-row user">
            <div class="chat-bubble">
              <MarkdownRenderer content={turn.userMessage.text} />
              <div class="chat-time">{formatDate(turn.userMessage.timestamp)}</div>
            </div>
          </article>
        {/if}

        {#each turn.assistantMessages as message (message.id)}
          <article class="chat-row">
            <div class="chat-bubble">
              <MarkdownRenderer content={message.text} />
              <div class="chat-time">{formatDate(message.timestamp)}</div>
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
</section>
