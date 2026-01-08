import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Check, Plus, Link2, ChevronDown, ChevronRight } from "lucide-react";
import { ValidationError, ContractRow } from "@/lib/bulkContractUpload";

interface ValidationErrorsTableProps {
  errors: ValidationError[];
  existingContracts?: { id: string; name: string }[];
  onAssignContract: (rowNumber: number, contractName: string, rowData: ContractRow) => void;
  onCreateContract: (rowNumber: number, rowData: ContractRow) => void;
  onUseSuggestion: (rowNumber: number, field: string, suggestion: string, rowData: ContractRow) => void;
}

export const ValidationErrorsTable = ({
  errors,
  existingContracts = [],
  onAssignContract,
  onCreateContract,
  onUseSuggestion,
}: ValidationErrorsTableProps) => {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [selectedContracts, setSelectedContracts] = useState<Record<number, string>>({});

  const toggleRow = (rowNumber: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(rowNumber)) {
      newExpanded.delete(rowNumber);
    } else {
      newExpanded.add(rowNumber);
    }
    setExpandedRows(newExpanded);
  };

  const handleSelectContract = (rowNumber: number, contractName: string) => {
    setSelectedContracts(prev => ({ ...prev, [rowNumber]: contractName }));
  };

  const handleConfirmAssign = (error: ValidationError) => {
    const selected = selectedContracts[error.row];
    if (selected && error.rowData) {
      onAssignContract(error.row, selected, error.rowData);
    }
  };

  return (
    <div className="space-y-2">
      {errors.map((error, index) => {
        const isExpanded = expandedRows.has(error.row);
        const isContractError = error.type === 'contract_not_found';
        const isRegionCommuneError = error.type === 'region_commune';
        const hasSuggestions = error.suggestions && error.suggestions.length > 0;

        return (
          <div key={index} className="border rounded-lg overflow-hidden">
            {/* Row Header */}
            <div 
              className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 ${isExpanded ? 'bg-muted/30' : ''}`}
              onClick={() => (isContractError || (isRegionCommuneError && hasSuggestions)) && toggleRow(error.row)}
            >
              {(isContractError || (isRegionCommuneError && hasSuggestions)) && (
                <button className="p-0.5">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              )}
              <Badge variant="outline" className="font-mono">Fila {error.row}</Badge>
              <Badge variant="secondary">{error.field}</Badge>
              <span className="text-destructive text-sm flex-1">{error.message}</span>
              {hasSuggestions && !isContractError && (
                <Badge variant="outline" className="text-amber-600 border-amber-600">
                  {error.suggestions!.length} sugerencia(s)
                </Badge>
              )}
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="border-t p-4 bg-muted/20 space-y-4">
                {isContractError && error.rowData && (
                  <>
                    {/* Quick suggestions */}
                    {hasSuggestions && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">¿Quisiste decir?</p>
                        <div className="flex flex-wrap gap-2">
                          {error.suggestions!.map((suggestion, idx) => (
                            <Button
                              key={idx}
                              variant="outline"
                              size="sm"
                              onClick={() => onUseSuggestion(error.row, 'nombre_contrato', suggestion, error.rowData!)}
                              className="gap-1"
                            >
                              <Check className="h-3 w-3" />
                              {suggestion}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="border-t pt-4 space-y-3">
                      <p className="text-sm font-medium">Opciones:</p>
                      
                      {/* Option 1: Assign to existing */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Asignar a contrato existente:</span>
                        <Select 
                          value={selectedContracts[error.row] || ""} 
                          onValueChange={(v) => handleSelectContract(error.row, v)}
                        >
                          <SelectTrigger className="w-[300px]">
                            <SelectValue placeholder="Seleccionar contrato..." />
                          </SelectTrigger>
                          <SelectContent>
                            {existingContracts.map((contract) => (
                              <SelectItem key={contract.id} value={contract.name}>
                                {contract.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button 
                          size="sm" 
                          disabled={!selectedContracts[error.row]}
                          onClick={() => handleConfirmAssign(error)}
                        >
                          Asignar
                        </Button>
                      </div>

                      {/* Option 2: Create new */}
                      <div className="flex items-center gap-2">
                        <Plus className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Crear contrato nuevo con estos datos:</span>
                        <Button 
                          size="sm" 
                          variant="secondary"
                          onClick={() => onCreateContract(error.row, error.rowData!)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Crear "{error.originalValue}"
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {isRegionCommuneError && hasSuggestions && error.rowData && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">¿Quisiste decir?</p>
                    <div className="flex flex-wrap gap-2">
                      {error.suggestions!.map((suggestion, idx) => (
                        <Button
                          key={idx}
                          variant="outline"
                          size="sm"
                          onClick={() => onUseSuggestion(error.row, error.field, suggestion, error.rowData!)}
                          className="gap-1"
                        >
                          <Check className="h-3 w-3" />
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
