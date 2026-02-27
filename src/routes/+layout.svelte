<script lang="ts">
  import "../app.css";
  import { invalidateAll } from "$app/navigation";
  import { onMount } from "svelte";
  import favicon from "$lib/assets/favicon.svg";
  import { startSse } from "$lib/client/sse";
  import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";
  import SseStatus from "$lib/components/SseStatus.svelte";
  import { initializeLocale, locale, t } from "$lib/i18n/store";

  let { children } = $props();

  onMount(() => {
    initializeLocale();
    const stop = startSse(() => {
      void invalidateAll();
    });
    return stop;
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{t("app.name", $locale)}</title>
</svelte:head>

<div class="page-shell">
  <header class="card" style="padding:0.8rem 1rem; margin-bottom:0.9rem;">
    <div
      style="display:flex; align-items:center; justify-content:space-between; gap:0.8rem; flex-wrap:wrap;"
    >
      <div style="display:flex; flex-direction:column; gap:0.2rem;">
        <strong style="font-size:1rem;">{t("app.name", $locale)}</strong>
        <span style="font-size:0.85rem; color:var(--muted);">{t("app.description", $locale)}</span>
      </div>
      <div style="display:flex; align-items:center; gap:0.6rem;">
        <SseStatus />
        <LanguageSwitcher />
      </div>
    </div>
  </header>

  {@render children()}
</div>
