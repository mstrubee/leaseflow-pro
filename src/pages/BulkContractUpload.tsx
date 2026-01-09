import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, Download, Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Loader2, FilePlus, RefreshCw, Database } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { generateContractTemplate } from "@/lib/generateContractTemplate";
import { generateContractTemplateWithData } from "@/lib/generateContractTemplateWithData";
import { parseExcelFile, validateRows, uploadContracts, ContractRow, ValidationResult, UploadResult } from "@/lib/bulkContractUpload";
import { useToast } from "@/hooks/use-toast";
import { ValidationErrorsTable } from "@/components/bulk-upload/ValidationErrorsTable";
import { supabase } from "@/integrations/supabase/client";
import logosHeader from "@/assets/logos-header.png";

const BulkContractUpload = () => {
  const navigate = useNavigate();
  const { user, loading, isAdmin, roleLoaded } = useAuth();
  const { toast } = useToast();
  
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingWithData, setDownloadingWithData] = useState(false);
  
  // State
  const [parsedRows, setParsedRows] = useState<ContractRow[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
    if (!loading && roleLoaded && !isAdmin) {
      navigate("/");
    }
  }, [loading, user, isAdmin, roleLoaded, navigate]);

  const handleDownloadEmptyTemplate = () => {
    generateContractTemplate();
    toast({
      title: "Plantilla vacía descargada",
      description: "Se ha descargado la plantilla Excel vacía.",
    });
  };

  const handleDownloadTemplateWithData = async () => {
    setDownloadingWithData(true);
    try {
      const count = await generateContractTemplateWithData();
      toast({
        title: "Plantilla con datos descargada",
        description: `Se descargó la plantilla con ${count} contratos.`,
      });
    } catch (error: any) {
      toast({
        title: "Error al descargar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDownloadingWithData(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      toast({
        title: "Archivo inválido",
        description: "Por favor sube un archivo Excel (.xlsx o .xls)",
        variant: "destructive",
      });
      return;
    }
    
    setFile(selectedFile);
    setParsing(true);
    setUploadResult(null);
    
    try {
      const rows = await parseExcelFile(selectedFile);
      setParsedRows(rows);
      const validation = await validateRows(rows);
      setValidationResult(validation);
    } catch (error: any) {
      toast({
        title: "Error al procesar archivo",
        description: error.message,
        variant: "destructive",
      });
      setFile(null);
    } finally {
      setParsing(false);
    }
  };

  const handleUpload = async () => {
    if (!validationResult || validationResult.valid.length === 0) return;
    
    setUploading(true);
    try {
      const result = await uploadContracts(validationResult.valid);
      setUploadResult(result);
      
      if (result.success > 0) {
        const updatedCount = validationResult.toUpdate.length;
        const createdCount = validationResult.toCreate.length;
        
        let message = '';
        if (updatedCount > 0 && createdCount > 0) {
          message = `Se actualizaron ${updatedCount} contratos y se crearon ${createdCount} nuevos.`;
        } else if (updatedCount > 0) {
          message = `Se actualizaron ${updatedCount} contratos exitosamente.`;
        } else if (createdCount > 0) {
          message = `Se crearon ${createdCount} contratos exitosamente.`;
        }
        
        toast({
          title: "Carga completada",
          description: message,
        });
      }
      
      if (result.failed > 0) {
        toast({
          title: "Algunos contratos fallaron",
          description: `${result.failed} contratos no pudieron ser procesados.`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error en la carga",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const resetUpload = () => {
    setFile(null);
    setParsedRows([]);
    setValidationResult(null);
    setUploadResult(null);
  };

  // Handlers para errores de validación con acciones
  const handleAssignContract = (rowNumber: number, contractName: string, rowData: ContractRow) => {
    if (!validationResult) return;
    
    // Actualizar el row con el nombre de contrato correcto
    const updatedRow = { ...rowData, nombre_contrato: contractName };
    
    // Mover de errores a válidos
    const newErrors = validationResult.errors.filter(e => e.row !== rowNumber);
    const newValid = [...validationResult.valid, updatedRow];
    
    setValidationResult({
      ...validationResult,
      valid: newValid,
      errors: newErrors
    });
    
    toast({
      title: "Contrato asignado",
      description: `Fila ${rowNumber} asignada a "${contractName}"`,
    });
  };

  const handleCreateContract = async (rowNumber: number, rowData: ContractRow) => {
    if (!validationResult) return;
    
    try {
      // Crear el contrato
      const { data: newContract, error } = await supabase
        .from('contracts')
        .insert({ name: rowData.nombre_contrato })
        .select('id, name')
        .single();
      
      if (error) throw error;
      
      // Mover de errores a válidos
      const newErrors = validationResult.errors.filter(e => e.row !== rowNumber);
      const newValid = [...validationResult.valid, rowData];
      
      // Agregar el nuevo contrato a la lista
      const updatedContracts = [...(validationResult.existingContracts || []), newContract];
      
      setValidationResult({
        ...validationResult,
        valid: newValid,
        errors: newErrors,
        existingContracts: updatedContracts
      });
      
      toast({
        title: "Contrato creado",
        description: `Se creó el contrato "${rowData.nombre_contrato}"`,
      });
    } catch (error: any) {
      toast({
        title: "Error al crear contrato",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUseSuggestion = (rowNumber: number, field: string, suggestion: string, rowData: ContractRow) => {
    if (!validationResult) return;
    
    // Actualizar el row con el valor sugerido
    const updatedRow = { ...rowData };
    if (field === 'nombre_contrato') {
      updatedRow.nombre_contrato = suggestion;
    } else if (field === 'region/comuna') {
      // Determinar si es región o comuna basado en el valor
      if (updatedRow.region && suggestion.toLowerCase().includes(updatedRow.region.toLowerCase().substring(0, 3))) {
        updatedRow.region = suggestion;
      } else {
        updatedRow.comuna = suggestion;
      }
    }
    
    // Mover de errores a válidos
    const newErrors = validationResult.errors.filter(e => e.row !== rowNumber);
    const newValid = [...validationResult.valid, updatedRow];
    
    setValidationResult({
      ...validationResult,
      valid: newValid,
      errors: newErrors
    });
    
    toast({
      title: "Valor corregido",
      description: `Fila ${rowNumber}: se usó "${suggestion}"`,
    });
  };

  if (loading || !roleLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <img src={logosHeader} alt="AutoPlanet Agroplanet" className="h-[62px] object-contain" />
              <div>
                <h1 className="text-2xl font-semibold text-sky-950">Cargar/Actualizar Contratos</h1>
                <p className="text-sm text-muted-foreground mt-1">Importar múltiples contratos desde Excel</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate("/")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Alert>
          <RefreshCw className="h-4 w-4" />
          <AlertTitle>Carga y Actualización de Contratos</AlertTitle>
          <AlertDescription>
            Usa esta plantilla para crear contratos nuevos con información completa
            o para actualizar contratos existentes. Si el nombre del contrato existe, se actualizará.
            Si no existe, se creará uno nuevo.
          </AlertDescription>
        </Alert>

        {/* Step 1: Download Template */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Paso 1: Descargar Plantilla
            </CardTitle>
            <CardDescription>
              Descarga la plantilla Excel vacía o con la información actual de todos los contratos.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-4">
            <Button onClick={handleDownloadEmptyTemplate} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Descargar Plantilla Vacía
            </Button>
            <Button 
              onClick={handleDownloadTemplateWithData} 
              className="gap-2"
              disabled={downloadingWithData}
            >
              {downloadingWithData ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  Descargar con Información Completa
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Step 2: Upload File */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Paso 2: Subir Archivo
            </CardTitle>
            <CardDescription>
              Sube el archivo Excel con los datos de los contratos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="block w-full text-sm text-muted-foreground
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-primary file:text-primary-foreground
                  hover:file:bg-primary/90
                  cursor-pointer"
                disabled={uploading}
              />
              {file && !uploadResult && (
                <Button variant="outline" size="sm" onClick={resetUpload}>
                  Limpiar
                </Button>
              )}
            </div>

            {parsing && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Procesando archivo...
              </div>
            )}

            {file && !parsing && validationResult && !uploadResult && (
              <Alert variant={validationResult.errors.length > 0 ? "destructive" : "default"}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Resumen de Validación</AlertTitle>
                <AlertDescription>
                  <div className="mt-2 space-y-1">
                    {validationResult.toUpdate.length > 0 && (
                      <p className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-blue-600" />
                        Actualizaré {validationResult.toUpdate.length} contrato{validationResult.toUpdate.length !== 1 ? 's' : ''}
                      </p>
                    )}
                    {validationResult.toCreate.length > 0 && (
                      <p className="flex items-center gap-2">
                        <FilePlus className="h-4 w-4 text-green-600" />
                        Cargaré {validationResult.toCreate.length} contrato{validationResult.toCreate.length !== 1 ? 's' : ''} nuevo{validationResult.toCreate.length !== 1 ? 's' : ''}
                      </p>
                    )}
                    {validationResult.errors.length > 0 && (
                      <p className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-600" />
                        {validationResult.errors.length} error{validationResult.errors.length !== 1 ? 'es' : ''} encontrado{validationResult.errors.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Validation Errors */}
        {validationResult && validationResult.errors.length > 0 && !uploadResult && (
          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">Errores de Validación</CardTitle>
              <CardDescription>
                Revisa los errores y usa las opciones disponibles para corregirlos, o corrige el Excel y vuelve a subirlo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ValidationErrorsTable
                errors={validationResult.errors}
                existingContracts={validationResult.existingContracts}
                onAssignContract={handleAssignContract}
                onCreateContract={handleCreateContract}
                onUseSuggestion={handleUseSuggestion}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 3: Confirm Upload */}
        {validationResult && validationResult.valid.length > 0 && !uploadResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Paso 3: Confirmar Carga
              </CardTitle>
              <CardDescription>
                {validationResult.toUpdate.length > 0 && validationResult.toCreate.length > 0 ? (
                  <>Se actualizarán {validationResult.toUpdate.length} contratos y se crearán {validationResult.toCreate.length} nuevos.</>
                ) : validationResult.toUpdate.length > 0 ? (
                  <>Se actualizarán {validationResult.toUpdate.length} contratos.</>
                ) : (
                  <>Se crearán {validationResult.toCreate.length} contratos nuevos.</>
                )}
                {validationResult.errors.length > 0 && (
                  <span className="text-destructive"> Las filas con errores serán omitidas.</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={handleUpload} 
                disabled={uploading}
                className="gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Procesando contratos...
                  </>
                ) : (
                  <>
                    {validationResult.toUpdate.length > 0 && validationResult.toCreate.length === 0 ? (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        Actualizar {validationResult.toUpdate.length} Contratos
                      </>
                    ) : validationResult.toCreate.length > 0 && validationResult.toUpdate.length === 0 ? (
                      <>
                        <Upload className="h-4 w-4" />
                        Crear {validationResult.toCreate.length} Contratos
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Procesar {validationResult.valid.length} Contratos
                      </>
                    )}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Upload Results */}
        {uploadResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {uploadResult.failed === 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                )}
                Resultado de la Carga
              </CardTitle>
              <CardDescription>
                {uploadResult.success} contratos procesados, {uploadResult.failed} fallidos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contrato</TableHead>
                    <TableHead className="w-24">Estado</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploadResult.details.map((detail, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{detail.name}</TableCell>
                      <TableCell>
                        {detail.success ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="h-4 w-4" /> OK
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600">
                            <XCircle className="h-4 w-4" /> Error
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-destructive">{detail.error || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex gap-4">
                <Button onClick={resetUpload} variant="outline">
                  Cargar otro archivo
                </Button>
                <Button onClick={() => navigate("/contracts")}>
                  Ver Contratos
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default BulkContractUpload;
