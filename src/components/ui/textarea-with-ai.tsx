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

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          className={cn(isOverLimit && "border-destructive", className)}
          {...props}
        />

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

export { TextareaWithAI };
