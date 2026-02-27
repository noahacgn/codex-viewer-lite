<script lang="ts">
import { locale, t } from "$lib/i18n/store";
import type { PageData } from "./$types";

let { data }: { data: PageData } = $props();

const formatDate = (iso: string | null) => {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleString($locale);
};

const sessionTitle = (message: string | null, path: string) => {
  if (!message) {
    return path.split(/[\\/]/).at(-1) ?? path;
  }
  return message.length > 80 ? `${message.slice(0, 80)}...` : message;
};
</script>

<section class="card" style="padding:1rem; margin-bottom:0.9rem;">
  <h1 style="margin:0;">{t("project.title", $locale)}</h1>
  <p style="margin:0.35rem 0 0; color:var(--muted);">{t("project.subtitle", $locale)}</p>
  <div class="meta-row" style="margin-top:0.6rem;">
    <span>{t("project.path", $locale)}:</span>
    <span class="mono">{data.project.meta.workspacePath}</span>
  </div>
</section>

<section class="card" style="padding:1rem;">
  {#if data.sessions.length === 0}
    <div class="card" style="padding:1rem; background:var(--surface-weak);">{t("project.empty", $locale)}</div>
  {:else}
    <div class="chat-list">
      {#each data.sessions as session (session.id)}
        <a href={`/projects/${data.project.id}/sessions/${session.id}`} class="card list-item">
          <strong>{sessionTitle(session.meta.firstUserMessage, session.jsonlFilePath)}</strong>
          <div class="meta-row">
            <span>{t("project.messageCount", $locale)}: {session.meta.messageCount}</span>
            <span>{t("project.startedAt", $locale)}: {formatDate(session.meta.startedAt)}</span>
            <span>{t("project.updatedAt", $locale)}: {formatDate(session.meta.lastModifiedAt)}</span>
          </div>
          <div class="meta-row">
            <span class="mono">{session.id}</span>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</section>
