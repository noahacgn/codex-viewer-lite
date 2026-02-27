<script lang="ts">
  import { locale, t } from "$lib/i18n/store";
  import type { Project } from "$lib/shared/types";
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

<section class="card" style="padding:1rem; margin-bottom:0.9rem;">
  <h1 style="margin:0;">{t("projects.title", $locale)}</h1>
  <p style="margin:0.35rem 0 0; color:var(--muted);">{t("projects.subtitle", $locale)}</p>
</section>

<section class="card" style="padding:1rem;">
  <div class="toolbar" style="margin-bottom:0.9rem;">
    <input class="input" bind:value={search} placeholder={t("projects.search", $locale)} style="flex:1;" />
    <select class="select" bind:value={sortKey}>
      <option value="updated">{sortLabel("updated")}</option>
      <option value="name">{sortLabel("name")}</option>
      <option value="count">{sortLabel("count")}</option>
    </select>
    <button class="button" type="button" onclick={() => (descending = !descending)}>
      {descending ? "↓" : "↑"}
    </button>
  </div>

  {#if filteredProjects.length === 0}
    <div class="card" style="padding:1rem; background:var(--surface-weak);">{t("projects.empty", $locale)}</div>
  {:else}
    <div class="list-grid">
      {#each filteredProjects as project (project.id)}
        <a href={`/projects/${project.id}`} class="card list-item">
          <strong>{project.meta.workspaceName}</strong>
          <div class="meta-row">
            <span class="mono">{project.meta.workspacePath}</span>
          </div>
          <div class="meta-row">
            <span>{project.meta.sessionCount} {t("projects.sessions", $locale)}</span>
            <span>{t("projects.lastActive", $locale)}: {formatDate(project.meta.lastSessionAt)}</span>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</section>
