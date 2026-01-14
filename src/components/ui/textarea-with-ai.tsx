import * as React from "react";

import { cn } from "@/lib/utils";
import { AISummaryAction } from "./ai-summary-action";
import { Textarea, TextareaProps } from "./textarea";

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
    const charCount = value?.length || 0;
    const isOverLimit = maxLength ? charCount > maxLength : false;

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          {label ? (
            <label className="text-sm font-medium text-foreground">{label}</label>
          ) : (
            <span />
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

        <Textarea
          ref={ref}
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
