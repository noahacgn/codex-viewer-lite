<script lang="ts">
  import { locale, setLocale } from "$lib/i18n/store";
</script>

<label>
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

<style>
  .sr-only {
    border: 0;
    clip: rect(0, 0, 0, 0);
    height: 1px;
    margin: -1px;
    overflow: hidden;
    padding: 0;
    position: absolute;
    width: 1px;
  }
</style>
