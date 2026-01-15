import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Receipt, Loader2, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface EntryExpense {
  id: string;
  contract_id: string;
  name: string;
  amount_uf: number;
  amount_clp: number | null;
  currency: string;
  description: string | null;
  display_order: number;
}

interface EntryExpensesSectionProps {
  contractId: string;
  displayCurrency?: "UF" | "CLP";
  readOnly?: boolean;
}

export function EntryExpensesSection({ contractId, displayCurrency = "UF", readOnly = false }: EntryExpensesSectionProps) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { ufValue, convertUFToPesos, convertPesosToUF } = useEconomicIndicators();
  
  const [expenses, setExpenses] = useState<EntryExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"UF" | "CLP">("UF");
  const [description, setDescription] = useState("");

  useEffect(() => {
    loadExpenses();
  }, [contractId]);

  const loadExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from("entry_expenses")
        .select("*")
        .eq("contract_id", contractId)
        .order("display_order", { ascending: true });

      if (error) throw error;
      setExpenses(data || []);
    } catch (error: any) {
      console.error("Error loading entry expenses:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setAmount("");
    setCurrency("UF");
    setDescription("");
    setIsAdding(false);
    setEditingId(null);
  };

  const handleStartEdit = (expense: EntryExpense) => {
    setEditingId(expense.id);
    setName(expense.name);
    setCurrency(expense.currency as "UF" | "CLP");
    setAmount(expense.currency === "UF" 
      ? expense.amount_uf.toString() 
      : (expense.amount_clp || 0).toString()
    );
    setDescription(expense.description || "");
    setIsAdding(false);
  };

  const handleSave = async () => {
    if (!name.trim() || !amount) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Nombre y monto son requeridos",
      });
      return;
    }

    setSaving(true);
    try {
      const amountValue = parseFloat(amount);
      const amountUf = currency === "UF" ? amountValue : (ufValue > 0 ? amountValue / ufValue : 0);
      const amountClp = currency === "CLP" ? amountValue : (ufValue > 0 ? amountValue * ufValue : null);

      if (editingId) {
        // Update existing
        const { error } = await supabase
          .from("entry_expenses")
          .update({
            name: name.trim(),
            amount_uf: amountUf,
            amount_clp: amountClp,
            currency,
            description: description.trim() || null,
          })
          .eq("id", editingId);

        if (error) throw error;
        toast({ title: "Gasto actualizado" });
      } else {
        // Create new
        const maxOrder = Math.max(0, ...expenses.map(e => e.display_order));
        const { error } = await supabase
          .from("entry_expenses")
          .insert({
            contract_id: contractId,
            name: name.trim(),
            amount_uf: amountUf,
            amount_clp: amountClp,
            currency,
            description: description.trim() || null,
            display_order: maxOrder + 1,
          });

        if (error) throw error;
        toast({ title: "Gasto agregado" });
      }

      resetForm();
      loadExpenses();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar el gasto",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from("entry_expenses")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;
      toast({ title: "Gasto eliminado" });
      loadExpenses();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar el gasto",
      });
    } finally {
      setDeleteId(null);
    }
  };

  const formatAmount = (expense: EntryExpense) => {
    if (displayCurrency === "CLP") {
      const clp = expense.currency === "CLP" 
        ? expense.amount_clp || 0
        : expense.amount_uf * ufValue;
      return `$${Math.round(clp).toLocaleString("es-CL")}`;
    }
    return `${expense.amount_uf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`;
  };

  const getTotalUF = () => {
    return expenses.reduce((sum, e) => sum + e.amount_uf, 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canEdit = isAdmin && !readOnly;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Gastos de Entrada
          </CardTitle>
          {canEdit && !isAdding && !editingId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAdding(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Agregar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Form for adding/editing */}
        {(isAdding || editingId) && canEdit && (
          <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nombre</Label>
                <Input
                  placeholder="Ej: Habilitación"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Monto</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-8 text-sm flex-1"
                  />
                  <Select value={currency} onValueChange={(v) => setCurrency(v as "UF" | "CLP")}>
                    <SelectTrigger className="h-8 w-20 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UF">UF</SelectItem>
                      <SelectItem value="CLP">$</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descripción (opcional)</Label>
              <Input
                placeholder="Descripción del gasto"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={resetForm}
                disabled={saving}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1" />
                )}
                Guardar
              </Button>
            </div>
          </div>
        )}

        {/* List of expenses */}
        {expenses.length === 0 && !isAdding ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay gastos de entrada registrados
          </p>
        ) : (
          <div className="space-y-2">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between p-2 rounded-lg border bg-background hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{expense.name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {expense.currency}
                    </Badge>
                  </div>
                  {expense.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {expense.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span className="font-semibold text-sm text-primary">
                    {formatAmount(expense)}
                  </span>
                  {canEdit && !editingId && !isAdding && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleStartEdit(expense)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(expense.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            
            {/* Total */}
            {expenses.length > 0 && (
              <div className="flex items-center justify-between pt-2 border-t mt-2">
                <span className="text-sm font-medium">Total</span>
                <span className="font-bold text-primary">
                  {displayCurrency === "CLP" && ufValue > 0
                    ? `$${Math.round(getTotalUF() * ufValue).toLocaleString("es-CL")}`
                    : `${getTotalUF().toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`
                  }
                </span>
              </div>
            )}
          </div>
        )}

        {/* Delete confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar gasto de entrada?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

// Summary component for tables
export function EntryExpensesSummary({ contractId, displayCurrency = "UF" }: { contractId: string; displayCurrency?: "UF" | "CLP" }) {
  const [total, setTotal] = useState<number | null>(null);
  const { ufValue } = useEconomicIndicators();

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("entry_expenses")
        .select("amount_uf")
        .eq("contract_id", contractId);

      if (!error && data) {
        const sum = data.reduce((acc, e) => acc + (e.amount_uf || 0), 0);
        setTotal(sum);
      }
    };
    load();
  }, [contractId]);

  if (total === null || total === 0) return null;

  const formatted = displayCurrency === "CLP" && ufValue > 0
    ? `$${Math.round(total * ufValue).toLocaleString("es-CL")}`
    : `${total.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} UF`;

  return (
    <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
      <Receipt className="h-2.5 w-2.5 mr-1" />
      {formatted}
    </Badge>
  );
}
