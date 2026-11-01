/**
 * Plain-text projection of Markdown, stored alongside it (description_text,
 * body_text) for full-text search. Not a renderer: it only strips syntax.
 */
export function markdownToPlainText(md: string | null | undefined): string | null {
  if (!md) return null;
  const text = md
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1") // fenced code: keep content
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images
    .replace(/@\[([^\]]+)\]\(user:[^)]*\)/g, "$1") // mentions
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "") // headings
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "") // blockquotes
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, "") // list markers, task boxes
    .replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, "") // rules
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/(\*|_)(.*?)\1/g, "$2") // italic
    .replace(/~~(.*?)~~/g, "$1") // strike
    .replace(/<[^>]+>/g, "") // inline html
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, "$1") // escapes
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text === "" ? null : text;
}
