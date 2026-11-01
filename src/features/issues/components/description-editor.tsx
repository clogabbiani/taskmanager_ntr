"use client";

/**
 * Markdown description editor (Tiptap + @tiptap/markdown). Storage format is
 * Markdown in issues.description_md (CLAUDE.md §3.3). Mentions arrive in M3.
 */
import { useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Bold, Code, Heading2, Italic, Link2, List, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { it } from "@/i18n/it";
import { cn } from "@/lib/utils";

const PROSE =
  "prose-sm max-w-none text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground";

function extensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } },
    }),
    Markdown,
  ];
}

function Toolbar({ editor }: { editor: Editor }) {
  const items = [
    { label: it.issue.toolbar.bold, icon: Bold, active: "bold", run: () => editor.chain().focus().toggleBold().run() },
    {
      label: it.issue.toolbar.italic,
      icon: Italic,
      active: "italic",
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: it.issue.toolbar.heading,
      icon: Heading2,
      active: "heading",
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: it.issue.toolbar.bulletList,
      icon: List,
      active: "bulletList",
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: it.issue.toolbar.orderedList,
      icon: ListOrdered,
      active: "orderedList",
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    { label: it.issue.toolbar.code, icon: Code, active: "code", run: () => editor.chain().focus().toggleCode().run() },
    {
      label: it.issue.toolbar.link,
      icon: Link2,
      active: "link",
      run: () => {
        const previous = editor.getAttributes("link").href as string | undefined;
        const href = window.prompt(it.issue.toolbar.linkPrompt, previous ?? "https://");
        if (href === null) return;
        if (href.trim() === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
        else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
      },
    },
  ];
  return (
    <div className="flex flex-wrap gap-0.5 border-b p-1" role="toolbar" aria-label={it.issue.fields.description}>
      {items.map(({ label, icon: Icon, active, run }) => (
        <Button
          key={label}
          type="button"
          size="icon-sm"
          variant={editor.isActive(active) ? "secondary" : "ghost"}
          aria-label={label}
          aria-pressed={editor.isActive(active)}
          title={label}
          onMouseDown={(e) => e.preventDefault()}
          onClick={run}
        >
          <Icon />
        </Button>
      ))}
    </div>
  );
}

/** Read-only Markdown rendering through the same schema as the editor. */
function Preview({ markdown, onEdit, disabled }: { markdown: string | null; onEdit: () => void; disabled?: boolean }) {
  const editor = useEditor(
    {
      extensions: extensions(),
      content: markdown ?? "",
      contentType: "markdown",
      editable: false,
      immediatelyRender: false,
    },
    [markdown],
  );
  if (!markdown) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onEdit}
        className="text-muted-foreground hover:bg-muted/50 focus-visible:ring-ring w-full rounded-md border border-dashed p-3 text-left text-sm outline-none focus-visible:ring-2 disabled:cursor-default"
      >
        {disabled ? it.issue.none : it.issue.descriptionEmpty}
      </button>
    );
  }
  return (
    <div
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? undefined : 0}
      aria-label={disabled ? undefined : it.issue.edit}
      onClick={(e) => {
        if (disabled || (e.target as HTMLElement).closest("a")) return;
        onEdit();
      }}
      onKeyDown={(e) => {
        if (!disabled && e.key === "Enter") onEdit();
      }}
      className={cn(
        "focus-visible:ring-ring rounded-md p-1 outline-none focus-visible:ring-2",
        !disabled && "hover:bg-muted/40 cursor-text",
      )}
    >
      <EditorContent editor={editor} className={PROSE} />
    </div>
  );
}

function Editing({
  markdown,
  onSave,
  onCancel,
}: {
  markdown: string | null;
  onSave: (md: string | null) => void;
  onCancel: () => void;
}) {
  const editor = useEditor({
    extensions: extensions(),
    content: markdown ?? "",
    contentType: "markdown",
    autofocus: "end",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(PROSE, "min-h-32 p-3 outline-none"),
        "aria-label": it.issue.fields.description,
        "aria-multiline": "true",
      },
    },
  });
  if (!editor) return null;

  const save = () => {
    const md = editor.isEmpty ? null : editor.getMarkdown().trim();
    onSave(md || null);
  };

  return (
    <div
      className="focus-within:ring-ring/50 rounded-md border focus-within:ring-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
      }}
    >
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
      <div className="flex justify-end gap-2 border-t p-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {it.issue.cancel}
        </Button>
        <Button type="button" size="sm" onClick={save}>
          {it.issue.save}
        </Button>
      </div>
    </div>
  );
}

export function DescriptionEditor({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (md: string | null) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (editing && !disabled) {
    return (
      <Editing
        markdown={value}
        onCancel={() => setEditing(false)}
        onSave={(md) => {
          setEditing(false);
          if ((md ?? null) !== (value ?? null)) onChange(md);
        }}
      />
    );
  }
  return <Preview markdown={value} disabled={disabled} onEdit={() => setEditing(true)} />;
}
