<script lang="ts">
import { locale, t } from "$lib/i18n/store";
import { theme, toggleTheme } from "$lib/theme/store";

const nextThemeLabel = $derived.by(() => {
  return $theme === "dark" ? t("theme.switchToLight", $locale) : t("theme.switchToDark", $locale);
});
</script>

<button
  class="button icon-button theme-toggle"
  type="button"
  data-testid="theme-toggle"
  aria-label={nextThemeLabel}
  title={nextThemeLabel}
  onclick={toggleTheme}
>
  {#if $theme === "dark"}
    <svg class="theme-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"></circle>
      <path
        d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      ></path>
    </svg>
  {:else}
    <svg class="theme-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5Z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
      ></path>
    </svg>
  {/if}
</button>
