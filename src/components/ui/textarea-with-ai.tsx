import * as React from "react";
import { Bold, Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { AISummaryAction } from "./ai-summary-action";
import { Textarea, TextareaProps } from "./textarea";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/** Render markdown-style **bold** as <strong> in JSX */
function renderBoldMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function markdownToRichHtml(text: string): string {
  if (!text) return "";

  return escapeHtml(text)
    .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function htmlToMarkdown(html: string): string {
  if (!html || typeof document === "undefined") return "";

  const container = document.createElement("div");
  container.innerHTML = html;

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const element = node as HTMLElement;
    const content = Array.from(element.childNodes).map(walk).join("");

    switch (element.tagName) {
      case "BR":
        return "\n";
      case "STRONG":
      case "B":
        return content ? `**${content}**` : "";
      case "DIV":
      case "P":
        return `${content}\n`;
      default:
        return content;
    }
  };

  const text = Array.from(container.childNodes)
    .map(walk)
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  return text.replace(/^\n+|\n+$/g, "");
}

export interface TextareaWithAIProps extends Omit<TextareaProps, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  showCharCount?: boolean;
  enableAI?: boolean;
  aiButtonLabel?: string;
  downloadFileName?: string;
  confirmButtonLabel?: string;
  showOriginalInPreview?: boolean;
  label?: string;
  richText?: boolean;
}

const TextareaWithAI = React.forwardRef<HTMLTextAreaElement, TextareaWithAIProps>(
  (
    {
      value,
      onChange,
      maxLength,
      showCharCount = true,
      enableAI = true,
      aiButtonLabel = "Resumen IA",
      downloadFileName = "resumen-ia",
      confirmButtonLabel = "Usar este resumen",
      showOriginalInPreview = true,
      label,
        richText = false,
      className,
        placeholder,
        style,
        disabled,
      ...props
    },
    ref
  ) => {
    const internalRef = React.useRef<HTMLTextAreaElement>(null);
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || internalRef;
      const richEditorRef = React.useRef<HTMLDivElement>(null);
      const syncingRichEditorRef = React.useRef(false);

    const [showPreview, setShowPreview] = React.useState(false);
      const [isFocused, setIsFocused] = React.useState(false);
    const hasBold = value?.includes("**") || false;

    const charCount = value?.length || 0;
    const isOverLimit = maxLength ? charCount > maxLength : false;

    const handleBold = () => {
        if (richText) {
          const editor = richEditorRef.current;
          if (!editor || disabled) return;

          editor.focus();
          document.execCommand("bold");
          const nextValue = htmlToMarkdown(editor.innerHTML);
          onChange(nextValue);
          return;
        }

      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = value.substring(start, end);

      if (selected.startsWith("**") && selected.endsWith("**") && selected.length > 4) {
        // Remove bold
        const newValue = value.substring(0, start) + selected.slice(2, -2) + value.substring(end);
        onChange(newValue);
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(start, end - 4);
        });
      } else {
        // Add bold
        const newValue = value.substring(0, start) + `**${selected}**` + value.substring(end);
        onChange(newValue);
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(start, end + 4);
        });
      }
    };

      React.useEffect(() => {
        if (!richText) return;

        const editor = richEditorRef.current;
        if (!editor) return;

        const currentValue = htmlToMarkdown(editor.innerHTML);
        const nextValue = value || "";

        if (currentValue === nextValue) return;

        syncingRichEditorRef.current = true;
        editor.innerHTML = markdownToRichHtml(nextValue);
        syncingRichEditorRef.current = false;
      }, [richText, value]);

      const handleRichInput = () => {
        const editor = richEditorRef.current;
        if (!editor || syncingRichEditorRef.current) return;

        const nextValue = htmlToMarkdown(editor.innerHTML);
        if (nextValue !== value) {
          onChange(nextValue);
        }
      };

      const handleRichPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      };

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          {label ? (
            <label className="text-sm font-medium text-foreground">{label}</label>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBold}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <Bold className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Negrita (seleccionar texto primero)</p>
              </TooltipContent>
            </Tooltip>

            {!richText && hasBold && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPreview(!showPreview)}
                    className={cn(
                      "h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted",
                      showPreview && "text-primary bg-primary/10"
                    )}
                  >
                    {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{showPreview ? "Ocultar vista previa" : "Ver con formato"}</p>
                </TooltipContent>
              </Tooltip>
            )}

            {enableAI && (
              <AISummaryAction
                text={value}
                maxLength={maxLength}
                buttonLabel={aiButtonLabel}
                downloadFileName={downloadFileName}
                confirmButtonLabel={confirmButtonLabel}
                showOriginalInPreview={showOriginalInPreview}
                onConfirmReplace={onChange}
              />
            )}
          </div>
        </div>

        {richText ? (
          <div className="relative">
            {!value && !isFocused && placeholder ? (
              <span className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
                {placeholder}
              </span>
            ) : null}

            <div
              ref={richEditorRef}
              contentEditable={!disabled}
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              className={cn(
                "min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background whitespace-pre-wrap break-words focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                disabled && "cursor-not-allowed opacity-50",
                isOverLimit && "border-destructive",
                className
              )}
              style={style}
              onInput={handleRichInput}
              onPaste={handleRichPaste}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
          </div>
        ) : showPreview && hasBold ? (
          <div
            className={cn(
              "min-h-[80px] w-full rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm whitespace-pre-wrap cursor-pointer",
              className
            )}
            onClick={() => setShowPreview(false)}
            title="Clic para volver a editar"
          >
            {renderBoldMarkdown(value || "")}
          </div>
        ) : (
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            disabled={disabled}
            className={cn(isOverLimit && "border-destructive", className)}
            style={style}
            {...props}
          />
        )}

        {showCharCount && maxLength && (
          <span
            className={cn(
              "text-xs text-muted-foreground",
              isOverLimit && "text-destructive"
            )}
          >
            {charCount}/{maxLength} caracteres
          </span>
        )}
      </div>
    );
  }
);

TextareaWithAI.displayName = "TextareaWithAI";

export { TextareaWithAI, renderBoldMarkdown };
