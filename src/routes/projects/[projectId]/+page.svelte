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

<section class="card section-card">
  <div class="section-header">
    <div class="section-copy">
      <h1 class="section-title">{t("project.title", $locale)}</h1>
      <p class="section-subtitle">{t("project.subtitle", $locale)}</p>
    </div>
    <a class="button section-header-action" data-testid="back-project-list" href="/projects">
      {t("common.backProjectList", $locale)}
    </a>
  </div>
  <div class="session-meta-grid">
    <div class="session-meta-card">
      <span class="session-meta-label">{t("project.path", $locale)}</span>
      <span class="session-meta-value mono">{data.project.meta.workspacePath}</span>
    </div>
  </div>
</section>

<section class="card section-card">
  {#if data.sessions.length === 0}
    <div class="empty-state">{t("project.empty", $locale)}</div>
  {:else}
    <div class="chat-list">
      {#each data.sessions as session (session.id)}
        <a href={`/projects/${data.project.id}/sessions/${session.id}`} class="card list-item">
          <div class="list-item-header">
            <strong class="list-item-title">{sessionTitle(session.meta.firstUserMessage, session.jsonlFilePath)}</strong>
          </div>
          <div class="list-item-footer">
            <span>{t("project.messageCount", $locale)}: {session.meta.messageCount}</span>
            <span>{t("project.startedAt", $locale)}: {formatDate(session.meta.startedAt)}</span>
            <span>{t("project.updatedAt", $locale)}: {formatDate(session.meta.lastModifiedAt)}</span>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</section>
