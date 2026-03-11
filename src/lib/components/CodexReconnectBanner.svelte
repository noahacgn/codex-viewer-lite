<script lang="ts">
import {
  codexReconnectAlertState,
  dismiss,
  requestPermission,
  visibleCodexReconnectIncident,
} from "$lib/client/codex-reconnect-alerts";
import { locale, t } from "$lib/i18n/store";

const formatDate = (iso: string) => {
  return new Date(iso).toLocaleString($locale);
};

const notificationMessage = () => {
  if ($codexReconnectAlertState.notificationPermission === "unsupported") {
    return t("reconnect.banner.notificationUnsupported", $locale);
  }
  if ($codexReconnectAlertState.notificationPermission === "denied") {
    return t("reconnect.banner.notificationDenied", $locale);
  }
  if ($codexReconnectAlertState.notificationPermission === "granted") {
    return t("reconnect.banner.notificationGranted", $locale);
  }
  return t("reconnect.banner.notificationPrompt", $locale);
};
</script>

{#if $visibleCodexReconnectIncident}
  <section class="card reconnect-banner" aria-live="polite" role="status">
    <div class="reconnect-banner-copy">
      <strong class="reconnect-banner-title">{t("reconnect.banner.title", $locale)}</strong>
      <p class="reconnect-banner-description">{t("reconnect.banner.description", $locale)}</p>
      <div class="reconnect-banner-meta">
        <span>{t("reconnect.banner.sourceLabel", $locale)} <code>{$visibleCodexReconnectIncident.source}</code></span>
        <span>{t("reconnect.banner.timeLabel", $locale)} {formatDate($visibleCodexReconnectIncident.detectedAt)}</span>
      </div>
      <p class="reconnect-banner-helper">{notificationMessage()}</p>
    </div>

    <div class="reconnect-banner-actions">
      {#if $codexReconnectAlertState.notificationPermission === "default"}
        <button class="button button-primary" type="button" onclick={() => void requestPermission()}>
          {t("reconnect.banner.enableNotifications", $locale)}
        </button>
      {/if}
      <button class="button" type="button" onclick={dismiss}>{t("reconnect.banner.dismiss", $locale)}</button>
    </div>
  </section>
{/if}

<style>
  .reconnect-banner {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    padding: 1rem 1.2rem;
    border-color: var(--warning-border);
    background:
      radial-gradient(circle at top right, rgb(255 178 74 / 16%) 0%, transparent 32%),
      linear-gradient(180deg, var(--warning-soft) 0%, var(--surface) 100%);
  }

  .reconnect-banner-copy {
    min-width: 0;
  }

  .reconnect-banner-title {
    display: block;
    margin-bottom: 0.4rem;
    color: var(--text);
    font-size: 0.98rem;
    font-weight: 760;
    letter-spacing: -0.02em;
  }

  .reconnect-banner-description,
  .reconnect-banner-helper {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.55;
  }

  .reconnect-banner-description {
    max-width: 54rem;
  }

  .reconnect-banner-helper {
    margin-top: 0.55rem;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .reconnect-banner-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem 1rem;
    margin-top: 0.65rem;
    color: var(--text-secondary);
    font-size: 0.88rem;
  }

  .reconnect-banner-meta code {
    padding: 0.12rem 0.3rem;
    border: 1px solid var(--warning-border);
    border-radius: 7px;
    background: rgb(255 178 74 / 12%);
  }

  .reconnect-banner-actions {
    display: flex;
    align-items: start;
    justify-content: flex-end;
    gap: 0.65rem;
    flex-wrap: wrap;
  }

  @media (max-width: 768px) {
    .reconnect-banner {
      grid-template-columns: 1fr;
    }

    .reconnect-banner-actions {
      justify-content: flex-start;
    }
  }
</style>
