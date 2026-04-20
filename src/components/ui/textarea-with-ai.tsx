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
      className,
      ...props
    },
    ref
  ) => {
    const internalRef = React.useRef<HTMLTextAreaElement>(null);
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || internalRef;
    const highlightRef = React.useRef<HTMLDivElement>(null);

    const [showPreview, setShowPreview] = React.useState(false);
    const hasBold = value?.includes("**") || false;

    // Sync scroll between textarea and the highlight overlay
    const handleScroll = React.useCallback(() => {
      const ta = textareaRef.current;
      const hl = highlightRef.current;
      if (!ta || !hl) return;
      hl.scrollTop = ta.scrollTop;
      hl.scrollLeft = ta.scrollLeft;
    }, [textareaRef]);

    const charCount = value?.length || 0;
    const isOverLimit = maxLength ? charCount > maxLength : false;

    const handleBold = () => {
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

            {hasBold && (
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

        {showPreview && hasBold ? (
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
        ) : hasBold ? (
          // Live-bold mode: textarea with transparent text + highlight overlay rendering markdown bold
          <div className="relative w-full">
            <div
              ref={highlightRef}
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-0 overflow-hidden rounded-md border border-transparent px-3 py-2 text-sm whitespace-pre-wrap text-foreground",
                className
              )}
              style={{
                fontFamily: "inherit",
                lineHeight: "1.5",
                letterSpacing: "normal",
                wordBreak: "break-word",
                overflowWrap: "break-word",
                tabSize: 4,
              }}
            >
              {renderBoldMarkdown((value || "") + "\n")}
            </div>
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onScroll={handleScroll}
              maxLength={maxLength}
              className={cn(
                "relative bg-transparent text-transparent caret-foreground selection:bg-primary/30 selection:text-transparent",
                isOverLimit && "border-destructive",
                className
              )}
              style={{
                fontFamily: "inherit",
                lineHeight: "1.5",
                letterSpacing: "normal",
                wordBreak: "break-word",
                overflowWrap: "break-word",
                tabSize: 4,
              }}
              {...props}
            />
          </div>
        ) : (
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={maxLength}
            className={cn(isOverLimit && "border-destructive", className)}
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
