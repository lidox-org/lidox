import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Code,
  Quote,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo,
  Redo,
  Minus,
} from 'lucide-react';
import { useCallback, useState } from 'react';

interface Props {
  editor: Editor | null;
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function ToolbarButton({
  icon,
  label,
  isActive,
  onClick,
  disabled,
}: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`rounded-md p-1.5 transition-default ${
        isActive
          ? 'bg-accentLight text-accent'
          : 'text-muted hover:bg-surface hover:text-ink'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-6 w-px bg-border" />;
}

export function EditorToolbar({ editor }: Props) {
  const [linkUrl, setLinkUrl] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

  const setLink = useCallback(() => {
    if (!editor) return;

    if (showLinkInput) {
      if (linkUrl.trim()) {
        editor
          .chain()
          .focus()
          .extendMarkRange('link')
          .setLink({ href: linkUrl.trim() })
          .run();
      }
      setShowLinkInput(false);
      setLinkUrl('');
      return;
    }

    const previousUrl = editor.getAttributes('link').href as string | undefined;
    if (previousUrl) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    setShowLinkInput(true);
  }, [editor, showLinkInput, linkUrl]);

  if (!editor) return null;

  const iconSize = 'h-4 w-4';

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-xl border border-border bg-white px-2 py-1.5 shadow-sm">
      {/* Text formatting */}
      <ToolbarButton
        icon={<Bold className={iconSize} />}
        label="Bold (Ctrl+B)"
        isActive={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        icon={<Italic className={iconSize} />}
        label="Italic (Ctrl+I)"
        isActive={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        icon={<Underline className={iconSize} />}
        label="Underline (Ctrl+U)"
        isActive={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolbarButton
        icon={<Strikethrough className={iconSize} />}
        label="Strikethrough"
        isActive={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />

      <Divider />

      {/* Headings */}
      <ToolbarButton
        icon={<Heading1 className={iconSize} />}
        label="Heading 1"
        isActive={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        icon={<Heading2 className={iconSize} />}
        label="Heading 2"
        isActive={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        icon={<Heading3 className={iconSize} />}
        label="Heading 3"
        isActive={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />

      <Divider />

      {/* Lists */}
      <ToolbarButton
        icon={<List className={iconSize} />}
        label="Bullet List"
        isActive={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={<ListOrdered className={iconSize} />}
        label="Ordered List"
        isActive={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />

      <Divider />

      {/* Block elements */}
      <ToolbarButton
        icon={<Code className={iconSize} />}
        label="Code Block"
        isActive={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <ToolbarButton
        icon={<Quote className={iconSize} />}
        label="Blockquote"
        isActive={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        icon={<Minus className={iconSize} />}
        label="Horizontal Rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      />

      <Divider />

      {/* Link */}
      <ToolbarButton
        icon={<LinkIcon className={iconSize} />}
        label="Link"
        isActive={editor.isActive('link')}
        onClick={setLink}
      />

      {showLinkInput && (
        <div className="ml-1 flex items-center gap-1">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            className="w-48 rounded-md border border-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setLink();
              }
              if (e.key === 'Escape') {
                setShowLinkInput(false);
                setLinkUrl('');
              }
            }}
          />
          <button
            onClick={() => {
              setShowLinkInput(false);
              setLinkUrl('');
            }}
            className="text-xs text-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
      )}

      <Divider />

      {/* Text align */}
      <ToolbarButton
        icon={<AlignLeft className={iconSize} />}
        label="Align Left"
        isActive={editor.isActive({ textAlign: 'left' })}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      />
      <ToolbarButton
        icon={<AlignCenter className={iconSize} />}
        label="Align Center"
        isActive={editor.isActive({ textAlign: 'center' })}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      />
      <ToolbarButton
        icon={<AlignRight className={iconSize} />}
        label="Align Right"
        isActive={editor.isActive({ textAlign: 'right' })}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      />
      <ToolbarButton
        icon={<AlignJustify className={iconSize} />}
        label="Justify"
        isActive={editor.isActive({ textAlign: 'justify' })}
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
      />

      <Divider />

      {/* History */}
      <ToolbarButton
        icon={<Undo className={iconSize} />}
        label="Undo (Ctrl+Z)"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      />
      <ToolbarButton
        icon={<Redo className={iconSize} />}
        label="Redo (Ctrl+Shift+Z)"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      />
    </div>
  );
}
