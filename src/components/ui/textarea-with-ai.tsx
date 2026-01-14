import * as React from "react";
import { Textarea, TextareaProps } from "./textarea";
import { Button } from "./button";
import { Sparkles, Loader2 } from "lucide-react";
import { useAISummarize } from "@/hooks/useAISummarize";
import { cn } from "@/lib/utils";

export interface TextareaWithAIProps extends Omit<TextareaProps, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  showCharCount?: boolean;
  enableAI?: boolean;
  aiButtonLabel?: string;
}

const TextareaWithAI = React.forwardRef<HTMLTextAreaElement, TextareaWithAIProps>(
  (
    {
      value,
      onChange,
      maxLength,
      showCharCount = true,
      enableAI = true,
      aiButtonLabel = "Resumir con IA",
      className,
      ...props
    },
    ref
  ) => {
    const { summarize, isLoading } = useAISummarize();

    const handleSummarize = async () => {
      const summary = await summarize(value, maxLength);
      if (summary) {
        onChange(summary);
      }
    };

    const charCount = value?.length || 0;
    const isOverLimit = maxLength ? charCount > maxLength : false;

    return (
      <div className="space-y-2">
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          className={cn(isOverLimit && "border-destructive", className)}
          {...props}
        />
        <div className="flex items-center justify-between gap-2">
          {showCharCount && maxLength ? (
            <span
              className={cn(
                "text-xs text-muted-foreground",
                isOverLimit && "text-destructive"
              )}
            >
              {charCount}/{maxLength} caracteres
            </span>
          ) : (
            <span />
          )}
          {enableAI && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSummarize}
              disabled={isLoading || charCount < 30}
              className="gap-1.5"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Resumiendo...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  {aiButtonLabel}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    );
  }
);

TextareaWithAI.displayName = "TextareaWithAI";

export { TextareaWithAI };
