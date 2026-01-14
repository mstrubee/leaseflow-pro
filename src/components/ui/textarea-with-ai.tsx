import * as React from "react";
import { Textarea, TextareaProps } from "./textarea";
import { Button } from "./button";
import { Sparkles, Loader2, Download, Check, X } from "lucide-react";
import { useAISummarize } from "@/hooks/useAISummarize";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { ScrollArea } from "./scroll-area";

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
      aiButtonLabel = "Resumir con IA",
      downloadFileName = "resumen-ia",
      confirmButtonLabel = "Usar este resumen",
      showOriginalInPreview = true,
      label,
      className,
      ...props
    },
    ref
  ) => {
    const { summarize, isLoading } = useAISummarize();
    const [previewSummary, setPreviewSummary] = React.useState<string | null>(null);
    const [showPreviewDialog, setShowPreviewDialog] = React.useState(false);

    const handleSummarize = async () => {
      const summary = await summarize(value, maxLength);
      if (summary) {
        setPreviewSummary(summary);
        setShowPreviewDialog(true);
      }
    };

    const handleDownload = () => {
      if (!previewSummary) return;
      const blob = new Blob([previewSummary], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${downloadFileName}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const handleConfirmReplace = () => {
      if (previewSummary) {
        onChange(previewSummary);
      }
      setShowPreviewDialog(false);
      setPreviewSummary(null);
    };

    const handleCancel = () => {
      setShowPreviewDialog(false);
      setPreviewSummary(null);
    };

    const charCount = value?.length || 0;
    const isOverLimit = maxLength ? charCount > maxLength : false;
    const summaryCharCount = previewSummary?.length || 0;
    const reductionPercentage = charCount > 0 
      ? Math.round((1 - summaryCharCount / charCount) * 100) 
      : 0;

    return (
      <div className="space-y-1.5">
        {/* Header row: Label + AI Button */}
        <div className="flex items-center justify-between">
          {label ? (
            <label className="text-sm font-medium text-foreground">{label}</label>
          ) : (
            <span />
          )}
          {enableAI && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSummarize}
              disabled={isLoading || charCount < 30}
              className="gap-1.5 h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
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

        {/* Textarea */}
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          className={cn(isOverLimit && "border-destructive", className)}
          {...props}
        />

        {/* Character count */}
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

        <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Resumen Generado con IA
              </DialogTitle>
              <DialogDescription>
                Revisa el resumen generado y decide si deseas usarlo.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {showOriginalInPreview && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Texto Original:
                  </label>
                  <ScrollArea className="h-24 rounded-md border bg-muted/30 p-3">
                    <p className="text-sm">{value}</p>
                  </ScrollArea>
                  <span className="text-xs text-muted-foreground">
                    {charCount} caracteres
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Resumen IA:
                </label>
                <ScrollArea className="h-24 rounded-md border border-primary/20 bg-primary/5 p-3">
                  <p className="text-sm">{previewSummary}</p>
                </ScrollArea>
                <span className="text-xs text-muted-foreground">
                  {summaryCharCount} caracteres
                  {reductionPercentage > 0 && (
                    <span className="ml-1 text-green-600">
                      (reducción del {reductionPercentage}%)
                    </span>
                  )}
                </span>
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={handleDownload}
                className="gap-1.5"
              >
                <Download className="h-4 w-4" />
                Descargar
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleCancel}
                  className="gap-1.5"
                >
                  <X className="h-4 w-4" />
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmReplace}
                  className="gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  {confirmButtonLabel}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);

TextareaWithAI.displayName = "TextareaWithAI";

export { TextareaWithAI };
