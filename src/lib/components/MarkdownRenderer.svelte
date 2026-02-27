<script lang="ts">
  import { marked } from "marked";

  type Props = {
    content: string;
    className?: string;
  };

  let { content, className = "" }: Props = $props();

  const stripRawHtml = (value: string) => {
    return value.replace(/<[^>\n]+>/g, "");
  };

  const sanitizeLinks = (value: string) => {
    return value.replace(/href="(javascript|data):[^"]*"/gi, 'href="#"');
  };

  const sanitizeEvents = (value: string) => {
    return value.replace(/\son[a-z]+="[^"]*"/gi, "");
  };

  const secureExternalLinks = (value: string) => {
    return value.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
  };

  const rendered = $derived.by(() => {
    const markdownInput = stripRawHtml(content ?? "");
    const html = marked.parse(markdownInput, { gfm: true, breaks: true }) as string;
    const noEvents = sanitizeEvents(html);
    const safeLinks = sanitizeLinks(noEvents);
    return secureExternalLinks(safeLinks);
  });
</script>

<div class={`markdown ${className}`}>{@html rendered}</div>
