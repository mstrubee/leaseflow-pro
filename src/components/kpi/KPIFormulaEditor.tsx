import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle, Plus, X, Variable } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface FormulaVariable {
  name: string;
  description: string;
  type: "number" | "percentage" | "currency";
}

interface KPIFormulaEditorProps {
  formula: string;
  variables: FormulaVariable[];
  onFormulaChange: (formula: string) => void;
  onVariablesChange: (variables: FormulaVariable[]) => void;
}

const SYSTEM_VARIABLES: FormulaVariable[] = [
  { name: "contratos_activos", description: "Número de contratos activos", type: "number" },
  { name: "contratos_vencidos", description: "Número de contratos vencidos", type: "number" },
  { name: "superficie_total", description: "Superficie total arrendada (m²)", type: "number" },
  { name: "arriendo_total_uf", description: "Arriendo total mensual en UF", type: "currency" },
  { name: "patentes_vigentes", description: "Número de patentes vigentes", type: "number" },
  { name: "patentes_vencidas", description: "Número de patentes vencidas", type: "number" },
  { name: "presupuesto_ejecutado", description: "Presupuesto ejecutado en UF", type: "currency" },
  { name: "presupuesto_total", description: "Presupuesto total en UF", type: "currency" },
];

export function KPIFormulaEditor({
  formula,
  variables,
  onFormulaChange,
  onVariablesChange,
}: KPIFormulaEditorProps) {
  const [localFormula, setLocalFormula] = useState(formula);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);
  const [newVariable, setNewVariable] = useState<FormulaVariable>({
    name: "",
    description: "",
    type: "number",
  });
  const [showAddVariable, setShowAddVariable] = useState(false);

  useEffect(() => {
    setLocalFormula(formula);
  }, [formula]);

  const validateFormula = (formulaStr: string) => {
    if (!formulaStr.trim()) {
      setValidationError(null);
      setIsValid(false);
      return;
    }

    // Check for balanced parentheses
    let balance = 0;
    for (const char of formulaStr) {
      if (char === "(") balance++;
      if (char === ")") balance--;
      if (balance < 0) {
        setValidationError("Paréntesis desbalanceados");
        setIsValid(false);
        return;
      }
    }
    if (balance !== 0) {
      setValidationError("Paréntesis desbalanceados");
      setIsValid(false);
      return;
    }

    // Check for valid characters and operators
    const validPattern = /^[\d\s+\-*/().,%\w]+$/;
    if (!validPattern.test(formulaStr)) {
      setValidationError("Caracteres no válidos en la fórmula");
      setIsValid(false);
      return;
    }

    // Check for referenced variables
    const variablePattern = /\{(\w+)\}/g;
    const referencedVars = [...formulaStr.matchAll(variablePattern)].map((m) => m[1]);
    const allVars = [...SYSTEM_VARIABLES, ...variables].map((v) => v.name);
    
    for (const refVar of referencedVars) {
      if (!allVars.includes(refVar)) {
        setValidationError(`Variable no definida: ${refVar}`);
        setIsValid(false);
        return;
      }
    }

    setValidationError(null);
    setIsValid(true);
  };

  const handleFormulaChange = (value: string) => {
    setLocalFormula(value);
    validateFormula(value);
  };

  const handleFormulaBlur = () => {
    if (isValid || !localFormula.trim()) {
      onFormulaChange(localFormula);
    }
  };

  const insertVariable = (varName: string) => {
    const newFormula = localFormula + `{${varName}}`;
    setLocalFormula(newFormula);
    validateFormula(newFormula);
  };

  const addCustomVariable = () => {
    if (!newVariable.name.trim()) return;
    
    const sanitizedName = newVariable.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    
    const updatedVariables = [...variables, { ...newVariable, name: sanitizedName }];
    onVariablesChange(updatedVariables);
    setNewVariable({ name: "", description: "", type: "number" });
    setShowAddVariable(false);
  };

  const removeCustomVariable = (name: string) => {
    onVariablesChange(variables.filter((v) => v.name !== name));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Fórmula</Label>
        <Textarea
          value={localFormula}
          onChange={(e) => handleFormulaChange(e.target.value)}
          onBlur={handleFormulaBlur}
          placeholder="Ej: ({contratos_activos} / {contratos_totales}) * 100"
          className="font-mono text-sm"
          rows={3}
        />
        {validationError && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{validationError}</AlertDescription>
          </Alert>
        )}
        {isValid && localFormula.trim() && (
          <Alert className="py-2 border-green-500 bg-green-50 dark:bg-green-950/20">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-400">
              Fórmula válida
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Variable className="h-4 w-4" />
            Variables del Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          <div className="flex flex-wrap gap-2">
            {SYSTEM_VARIABLES.map((v) => (
              <Badge
                key={v.name}
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80"
                onClick={() => insertVariable(v.name)}
                title={v.description}
              >
                {`{${v.name}}`}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Variable className="h-4 w-4" />
            Variables Personalizadas
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAddVariable(!showAddVariable)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </CardHeader>
        <CardContent className="py-2 space-y-3">
          {showAddVariable && (
            <div className="flex gap-2 items-end p-3 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <Label className="text-xs">Nombre</Label>
                <Input
                  value={newVariable.name}
                  onChange={(e) => setNewVariable({ ...newVariable, name: e.target.value })}
                  placeholder="nombre_variable"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">Descripción</Label>
                <Input
                  value={newVariable.description}
                  onChange={(e) => setNewVariable({ ...newVariable, description: e.target.value })}
                  placeholder="Descripción"
                  className="h-8 text-sm"
                />
              </div>
              <Button size="sm" onClick={addCustomVariable}>
                Agregar
              </Button>
            </div>
          )}
          
          {variables.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {variables.map((v) => (
                <Badge
                  key={v.name}
                  variant="outline"
                  className="cursor-pointer hover:bg-secondary/80 gap-1"
                  title={v.description}
                >
                  <span onClick={() => insertVariable(v.name)}>
                    {`{${v.name}}`}
                  </span>
                  <X
                    className="h-3 w-3 ml-1 hover:text-destructive"
                    onClick={() => removeCustomVariable(v.name)}
                  />
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay variables personalizadas definidas
            </p>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1">
        <p><strong>Operadores disponibles:</strong> + - * / ( ) %</p>
        <p><strong>Ejemplo:</strong> ({`{contratos_activos}`} / ({`{contratos_activos}`} + {`{contratos_vencidos}`})) * 100</p>
      </div>
    </div>
  );
}
