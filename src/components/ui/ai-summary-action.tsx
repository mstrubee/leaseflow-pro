import * as React from "react";
import { Sparkles, Loader2, Download, Check, X } from "lucide-react";

import { useAISummarize } from "@/hooks/useAISummarize";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { ScrollArea } from "./scroll-area";

export interface AISummaryActionProps {
  text: string;
  onConfirmReplace: (summary: string) => void;
  maxLength?: number;
  minChars?: number;

  buttonLabel?: string;
  downloadFileName?: string;
  confirmButtonLabel?: string;
  showOriginalInPreview?: boolean;

  className?: string;
}

export function AISummaryAction({
  text,
  onConfirmReplace,
  maxLength,
  minChars = 30,
  buttonLabel = "Resumen IA",
  downloadFileName = "resumen-ia",
  confirmButtonLabel = "Usar este resumen",
  showOriginalInPreview = true,
  className,
}: AISummaryActionProps) {
  const { summarize, isLoading } = useAISummarize();
  const [previewSummary, setPreviewSummary] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const charCount = text?.length || 0;
  const summaryCharCount = previewSummary?.length || 0;
  const reductionPercentage = charCount > 0 ? Math.round((1 - summaryCharCount / charCount) * 100) : 0;

  const disabled = isLoading || (text?.trim()?.length || 0) < minChars;

  const handleSummarize = async () => {
    const summary = await summarize(text, maxLength);
    if (summary) {
      setPreviewSummary(summary);
      setOpen(true);
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
      onConfirmReplace(previewSummary);
    }
    setOpen(false);
    setPreviewSummary(null);
  };

  const handleCancel = () => {
    setOpen(false);
    setPreviewSummary(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setPreviewSummary(null);
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleSummarize}
        disabled={disabled}
        className={cn(
          "gap-1.5 h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10",
          className
        )}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Resumiendo...
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5" />
            {buttonLabel}
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
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
                <label className="text-sm font-medium text-muted-foreground">Texto Original:</label>
                <ScrollArea className="h-24 rounded-md border bg-muted/30 p-3">
                  <p className="text-sm whitespace-pre-wrap">{text}</p>
                </ScrollArea>
                <span className="text-xs text-muted-foreground">{charCount} caracteres</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Resumen IA:</label>
              <ScrollArea className="h-24 rounded-md border border-primary/20 bg-primary/5 p-3">
                <p className="text-sm whitespace-pre-wrap">{previewSummary}</p>
              </ScrollArea>
              <span className="text-xs text-muted-foreground">
                {summaryCharCount} caracteres
                {reductionPercentage > 0 && (
                  <span className="ml-1 text-primary">(reducción del {reductionPercentage}%)</span>
                )}
              </span>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={handleDownload} className="gap-1.5">
              <Download className="h-4 w-4" />
              Descargar
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={handleCancel} className="gap-1.5">
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button type="button" onClick={handleConfirmReplace} className="gap-1.5">
                <Check className="h-4 w-4" />
                {confirmButtonLabel}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
