import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Check, X, Edit2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface NegotiationNotesCardProps {
  contractId: string;
  notes: string | null;
  isAdmin: boolean;
  onUpdate: () => void;
}

export const NegotiationNotesCard = ({
  contractId,
  notes,
  isAdmin,
  onUpdate,
}: NegotiationNotesCardProps) => {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(notes || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("contracts")
        .update({ negotiation_notes: editValue || null })
        .eq("id", contractId);

      if (error) throw error;

      toast({
        title: "Notas guardadas",
        description: "Las notas de negociación han sido actualizadas",
      });
      setIsEditing(false);
      onUpdate();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron guardar las notas",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(notes || "");
    setIsEditing(false);
  };

  // If no notes and not admin, show nothing
  if (!notes && !isAdmin) return null;

  return (
    <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <MessageSquare className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                Notas de Negociación
              </span>
              {isAdmin && !isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="h-7 px-2 text-amber-700 hover:text-amber-900 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30"
                >
                  <Edit2 className="h-3.5 w-3.5 mr-1" />
                  {notes ? "Editar" : "Agregar nota"}
                </Button>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="Ingrese notas sobre la negociación de este contrato..."
                  className="min-h-[80px] bg-white dark:bg-gray-900 border-amber-300 dark:border-amber-700 focus:ring-amber-500"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Guardar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={saving}
                    className="border-amber-300 text-amber-700 hover:bg-amber-100"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : notes ? (
              <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">
                {notes}
              </p>
            ) : (
              <p className="text-sm text-amber-600 dark:text-amber-500 italic">
                Sin notas de negociación
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
