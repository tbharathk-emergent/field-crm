// Minimal, safe markdown → HTML renderer for legal documents.
// Zero dependencies. Escapes HTML first, then applies a fixed set of
// transformations. Supports:
//   - # / ## / ### headings
//   - **bold**, *italic*, `inline code`
//   - links: [text](https://…)
//   - unordered lists (- item) and ordered lists (1. item)
//   - blockquotes (> …)
//   - fenced code blocks ```
//   - horizontal rule ---
//   - paragraphs from blank-line-separated blocks
//
// If you ever need to render UNTRUSTED markdown, swap this for a proper
// sanitizing library (DOMPurify + marked). Our legal content is authored
// by tenant admins via a moderated flow, but we still escape first for safety.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(line) {
  // NB: order matters — process code first so that ** inside `` is preserved literally
  return line
    // Inline code
    .replace(/`([^`]+?)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`)
    // Bold **text**
    .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
    // Italic *text* (not preceded by another *)
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>")
    // Italic _text_ (word-boundary safe)
    .replace(/(^|\W)_([^_\n]+?)_(?=\W|$)/g, "$1<em>$2</em>")
    // Links [text](url)
    .replace(/\[([^\]]+?)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
}

export function renderMarkdown(md) {
  if (!md) return "";
  const safe = escapeHtml(md);
  const lines = safe.split(/\r?\n/);
  const out = [];
  let inCode = false;
  let codeBuf = [];
  let listType = null;   // "ul" | "ol" | null
  let paraBuf = [];

  const flushPara = () => {
    if (paraBuf.length) {
      // Apply inline formatting on the joined paragraph so **bold**, *italic*,
      // `code`, [links](…) can span line-wraps in the source.
      out.push(`<p>${renderInline(paraBuf.join(" "))}</p>`);
      paraBuf = [];
    }
  };
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    // Fenced code block
    if (line.startsWith("```")) {
      if (inCode) {
        flushPara(); closeList();
        out.push(`<pre><code>${codeBuf.join("\n")}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        flushPara(); closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      continue;
    }

    // Blank line — paragraph break / list end
    if (line === "") { flushPara(); closeList(); continue; }

    // Headings
    const hMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (hMatch) {
      flushPara(); closeList();
      const level = hMatch[1].length;
      out.push(`<h${level}>${renderInline(hMatch[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(line) || /^\*{3,}$/.test(line)) {
      flushPara(); closeList();
      out.push("<hr />");
      continue;
    }

    // Blockquote
    if (line.startsWith("&gt;")) {
      flushPara(); closeList();
      out.push(`<blockquote>${renderInline(line.replace(/^&gt;\s?/, ""))}</blockquote>`);
      continue;
    }

    // Unordered list
    const ulMatch = /^[-*+]\s+(.*)$/.exec(line);
    if (ulMatch) {
      flushPara();
      if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
      out.push(`<li>${renderInline(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = /^(\d+)\.\s+(.*)$/.exec(line);
    if (olMatch) {
      flushPara();
      if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
      out.push(`<li>${renderInline(olMatch[2])}</li>`);
      continue;
    }

    // Regular paragraph text
    closeList();
    paraBuf.push(line);
  }

  // Flush leftovers
  if (inCode && codeBuf.length) out.push(`<pre><code>${codeBuf.join("\n")}</code></pre>`);
  flushPara();
  closeList();

  return out.join("\n");
}

export default renderMarkdown;
