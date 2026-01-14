import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export function useAISummarize() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const summarize = async (text: string, maxLength: number = 500): Promise<string | null> => {
    if (!text || text.trim().length < 30) {
      toast({
        title: "Texto muy corto",
        description: "El texto debe tener al menos 30 caracteres para resumir",
        variant: "destructive",
      });
      return null;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/summarize-text`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text, maxLength }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "Error",
          description: data.error || "Error al generar resumen",
          variant: "destructive",
        });
        return null;
      }

      toast({
        title: "Resumen generado",
        description: "El texto ha sido resumido exitosamente",
      });

      return data.summary;
    } catch (error) {
      console.error("Error summarizing:", error);
      toast({
        title: "Error",
        description: "Error de conexión al generar resumen",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return { summarize, isLoading };
}
