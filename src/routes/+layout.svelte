<script lang="ts">
import "../app.css";
import { onMount } from "svelte";
import { invalidateAll } from "$app/navigation";
import favicon from "$lib/assets/favicon.svg";
import { startSse } from "$lib/client/sse";
import CodexReconnectBanner from "$lib/components/CodexReconnectBanner.svelte";
import LanguageSwitcher from "$lib/components/LanguageSwitcher.svelte";
import SseStatus from "$lib/components/SseStatus.svelte";
import ThemeSwitcher from "$lib/components/ThemeSwitcher.svelte";
import { initializeLocale, locale, t } from "$lib/i18n/store";
import { initializeTheme } from "$lib/theme/store";

let { children } = $props();

onMount(() => {
  initializeTheme();
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
  <header class="card site-header">
    <div class="site-header-main">
      <div class="site-branding">
        <strong class="site-title">{t("app.name", $locale)}</strong>
        <span class="site-description">{t("app.description", $locale)}</span>
      </div>
      <div class="site-actions">
        <SseStatus />
        <ThemeSwitcher />
        <LanguageSwitcher />
      </div>
    </div>
  </header>

  <CodexReconnectBanner />

  {@render children()}
</div>
