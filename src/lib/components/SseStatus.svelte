<script lang="ts">
  import { connectionState } from "$lib/client/sse";
  import { locale, t } from "$lib/i18n/store";

  const statusText = (state: "connecting" | "connected" | "reconnecting" | "disconnected") => {
    if (state === "connected") {
      return t("status.connected", $locale);
    }
    if (state === "reconnecting" || state === "connecting") {
      return t("status.reconnecting", $locale);
    }
    return t("status.disconnected", $locale);
  };
</script>

<div class="status-pill" aria-live="polite">
  <span
    class={`status-dot ${$connectionState === "connected"
      ? "connected"
      : $connectionState === "reconnecting" || $connectionState === "connecting"
        ? "reconnecting"
        : "disconnected"}`}
  ></span>
  <span>{statusText($connectionState)}</span>
</div>
