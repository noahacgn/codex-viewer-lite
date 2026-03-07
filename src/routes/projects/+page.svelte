<script lang="ts">
import { locale, t } from "$lib/i18n/store";
import type { PageData } from "./$types";

let { data }: { data: PageData } = $props();

let search = $state("");
let sortKey = $state<"updated" | "name" | "count">("updated");
let descending = $state(true);

const formatDate = (iso: string | null) => {
  if (!iso) {
    return "—";
  }
  return new Date(iso).toLocaleString($locale);
};

const filteredProjects = $derived.by(() => {
  const keyword = search.trim().toLowerCase();
  const scoped = keyword
    ? data.projects.filter((project) => {
        const name = project.meta.workspaceName.toLowerCase();
        const path = project.meta.workspacePath.toLowerCase();
        return name.includes(keyword) || path.includes(keyword);
      })
    : data.projects;

  const sorted = [...scoped].sort((a, b) => {
    if (sortKey === "name") {
      return a.meta.workspaceName.localeCompare(b.meta.workspaceName);
    }
    if (sortKey === "count") {
      return a.meta.sessionCount - b.meta.sessionCount;
    }
    const aTime = a.meta.lastSessionAt ? new Date(a.meta.lastSessionAt).getTime() : 0;
    const bTime = b.meta.lastSessionAt ? new Date(b.meta.lastSessionAt).getTime() : 0;
    return aTime - bTime;
  });

  return descending ? sorted.reverse() : sorted;
});

const sortLabel = (key: "updated" | "name" | "count") => {
  if (key === "name") {
    return t("projects.sort.name", $locale);
  }
  if (key === "count") {
    return t("projects.sort.count", $locale);
  }
  return t("projects.sort.updated", $locale);
};
</script>

<section class="card hero-panel">
  <div class="section-copy">
    <h1 class="section-title">{t("projects.title", $locale)}</h1>
    <p class="section-subtitle">{t("projects.subtitle", $locale)}</p>
  </div>
</section>

<section class="card section-card">
  <div class="toolbar filter-toolbar section-toolbar">
    <input class="input filter-search" bind:value={search} placeholder={t("projects.search", $locale)} />
    <select class="select" bind:value={sortKey}>
      <option value="updated">{sortLabel("updated")}</option>
      <option value="name">{sortLabel("name")}</option>
      <option value="count">{sortLabel("count")}</option>
    </select>
    <button class="button sort-direction-button" type="button" onclick={() => (descending = !descending)}>
      {descending ? "↓" : "↑"}
    </button>
  </div>

  {#if filteredProjects.length === 0}
    <div class="empty-state">{t("projects.empty", $locale)}</div>
  {:else}
    <div class="list-grid">
      {#each filteredProjects as project (project.id)}
        <a href={`/projects/${project.id}`} class="card list-item">
          <div class="list-item-header">
            <strong class="list-item-title">{project.meta.workspaceName}</strong>
          </div>
          <div class="meta-row">
            <span class="path-chip mono">{project.meta.workspacePath}</span>
          </div>
          <div class="list-item-footer">
            <span>{project.meta.sessionCount} {t("projects.sessions", $locale)}</span>
            <span>{t("projects.lastActive", $locale)}: {formatDate(project.meta.lastSessionAt)}</span>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</section>
