<script lang="ts">
import { locale, setLocale } from "$lib/i18n/store";
</script>

<label class="language-switcher">
  <span class="sr-only">language</span>
  <select
    class="select"
    bind:value={$locale}
    onchange={(event) => {
      const selected = (event.currentTarget as HTMLSelectElement).value as "zh-CN" | "en-US";
      setLocale(selected);
    }}
  >
    <option value="zh-CN">简体中文</option>
    <option value="en-US">English</option>
  </select>
</label>
