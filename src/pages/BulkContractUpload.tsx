import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download, Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Loader2, FilePlus, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { generateContractTemplate } from "@/lib/generateContractTemplate";
import { generateMinimalContractTemplate } from "@/lib/generateMinimalContractTemplate";
import { parseExcelFile, validateRows, uploadContracts, ContractRow, ValidationResult, UploadResult } from "@/lib/bulkContractUpload";
import { parseMinimalExcelFile, validateMinimalRows, uploadMinimalContracts, MinimalContractRow, MinimalValidationResult, MinimalUploadResult } from "@/lib/minimalContractUpload";
import { useToast } from "@/hooks/use-toast";
import logosHeader from "@/assets/logos-header.png";

type UploadMode = 'minimal' | 'standard';

const BulkContractUpload = () => {
  const navigate = useNavigate();
  const { user, loading, isAdmin, roleLoaded } = useAuth();
  const { toast } = useToast();
  
  const [uploadMode, setUploadMode] = useState<UploadMode>('minimal');
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Standard mode state
  const [parsedRows, setParsedRows] = useState<ContractRow[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  
  // Minimal mode state
  const [minimalParsedRows, setMinimalParsedRows] = useState<MinimalContractRow[]>([]);
  const [minimalValidationResult, setMinimalValidationResult] = useState<MinimalValidationResult | null>(null);
  const [minimalUploadResult, setMinimalUploadResult] = useState<MinimalUploadResult | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
    if (!loading && roleLoaded && !isAdmin) {
      navigate("/");
    }
  }, [loading, user, isAdmin, roleLoaded, navigate]);

  const handleDownloadMinimalTemplate = async () => {
    await generateMinimalContractTemplate();
    toast({
      title: "Plantilla mínima descargada",
      description: "Se ha descargado la plantilla Excel con información mínima.",
    });
  };

  const handleDownloadStandardTemplate = () => {
    generateContractTemplate();
    toast({
      title: "Plantilla estándar descargada",
      description: "Se ha descargado la plantilla Excel completa para actualización.",
    });
  };

  const handleMinimalFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    setMinimalUploadResult(null);
    
    try {
      const rows = await parseMinimalExcelFile(selectedFile);
      setMinimalParsedRows(rows);
      const validation = await validateMinimalRows(rows);
      setMinimalValidationResult(validation);
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

  const handleStandardFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const validation = validateRows(rows);
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

  const handleMinimalUpload = async () => {
    if (!minimalValidationResult || minimalValidationResult.valid.length === 0) return;
    
    setUploading(true);
    try {
      const result = await uploadMinimalContracts(minimalValidationResult.valid);
      setMinimalUploadResult(result);
      
      if (result.success > 0) {
        toast({
          title: "Carga completada",
          description: `Se crearon ${result.success} contratos exitosamente.`,
        });
      }
      
      if (result.failed > 0) {
        toast({
          title: "Algunos contratos fallaron",
          description: `${result.failed} contratos no pudieron ser creados.`,
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

  const handleStandardUpload = async () => {
    if (!validationResult || validationResult.valid.length === 0) return;
    
    setUploading(true);
    try {
      const result = await uploadContracts(validationResult.valid);
      setUploadResult(result);
      
      if (result.success > 0) {
        toast({
          title: "Carga completada",
          description: `Se crearon ${result.success} contratos exitosamente.`,
        });
      }
      
      if (result.failed > 0) {
        toast({
          title: "Algunos contratos fallaron",
          description: `${result.failed} contratos no pudieron ser creados.`,
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
    setMinimalParsedRows([]);
    setMinimalValidationResult(null);
    setMinimalUploadResult(null);
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
                <h1 className="text-2xl font-semibold text-sky-950">Carga Masiva de Contratos</h1>
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
        <Tabs value={uploadMode} onValueChange={(v) => { setUploadMode(v as UploadMode); resetUpload(); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="minimal" className="gap-2">
              <FilePlus className="h-4 w-4" />
              Crear Contratos (Mínimo)
            </TabsTrigger>
            <TabsTrigger value="standard" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Actualizar Contratos (Completo)
            </TabsTrigger>
          </TabsList>

          {/* Minimal Mode - Create contracts with minimal info */}
          <TabsContent value="minimal" className="space-y-6 mt-6">
            <Alert>
              <FilePlus className="h-4 w-4" />
              <AlertTitle>Creación Rápida de Contratos</AlertTitle>
              <AlertDescription>
                Crea contratos con información mínima: Empresa(s), Nombre, CEBE y Código.
                Podrás completar la información posteriormente con la plantilla estándar.
              </AlertDescription>
            </Alert>

            {/* Step 1: Download Minimal Template */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Paso 1: Descargar Plantilla Mínima
                </CardTitle>
                <CardDescription>
                  Descarga la plantilla Excel con solo 4 columnas: Empresa(s), Nombre, CEBE, Código.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleDownloadMinimalTemplate} className="gap-2">
                  <Download className="h-4 w-4" />
                  Descargar Plantilla Mínima
                </Button>
              </CardContent>
            </Card>

            {/* Step 2: Upload Minimal File */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Paso 2: Subir Archivo
                </CardTitle>
                <CardDescription>
                  Sube el archivo Excel con los datos mínimos de los contratos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleMinimalFileChange}
                    className="block w-full text-sm text-muted-foreground
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-md file:border-0
                      file:text-sm file:font-semibold
                      file:bg-primary file:text-primary-foreground
                      hover:file:bg-primary/90
                      cursor-pointer"
                    disabled={uploading}
                  />
                  {file && !minimalUploadResult && (
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

                {file && !parsing && minimalValidationResult && !minimalUploadResult && (
                  <Alert variant={minimalValidationResult.errors.length > 0 ? "destructive" : "default"}>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Resumen de Validación</AlertTitle>
                    <AlertDescription>
                      <div className="mt-2 space-y-1">
                        <p className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          {minimalValidationResult.valid.length} contratos válidos
                        </p>
                        {minimalValidationResult.errors.length > 0 && (
                          <p className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-600" />
                            {minimalValidationResult.errors.length} errores encontrados
                          </p>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Minimal Validation Errors */}
            {minimalValidationResult && minimalValidationResult.errors.length > 0 && !minimalUploadResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-destructive">Errores de Validación</CardTitle>
                  <CardDescription>
                    Corrige estos errores en el archivo Excel y vuelve a subirlo.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Fila</TableHead>
                        <TableHead className="w-40">Campo</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {minimalValidationResult.errors.map((error, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono">{error.row}</TableCell>
                          <TableCell className="font-medium">{error.field}</TableCell>
                          <TableCell className="text-destructive">{error.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Confirm Minimal Upload */}
            {minimalValidationResult && minimalValidationResult.valid.length > 0 && !minimalUploadResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    Paso 3: Confirmar Carga
                  </CardTitle>
                  <CardDescription>
                    Se crearán {minimalValidationResult.valid.length} contratos con información mínima.
                    {minimalValidationResult.errors.length > 0 && (
                      <span className="text-destructive"> Las filas con errores serán omitidas.</span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={handleMinimalUpload} 
                    disabled={uploading}
                    className="gap-2"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creando contratos...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Crear {minimalValidationResult.valid.length} Contratos
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Minimal Upload Results */}
            {minimalUploadResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {minimalUploadResult.failed === 0 ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    )}
                    Resultado de la Carga
                  </CardTitle>
                  <CardDescription>
                    {minimalUploadResult.success} contratos creados, {minimalUploadResult.failed} fallidos
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
                      {minimalUploadResult.details.map((detail, index) => (
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
          </TabsContent>

          {/* Standard Mode - Create/Update contracts with full info */}
          <TabsContent value="standard" className="space-y-6 mt-6">
            <Alert>
              <RefreshCw className="h-4 w-4" />
              <AlertTitle>Actualización de Contratos</AlertTitle>
              <AlertDescription>
                Usa esta plantilla para crear contratos nuevos con información completa
                o para actualizar contratos existentes.
              </AlertDescription>
            </Alert>

            {/* Step 1: Download Standard Template */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Paso 1: Descargar Plantilla Estándar
                </CardTitle>
                <CardDescription>
                  Descarga la plantilla Excel con todas las columnas disponibles.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleDownloadStandardTemplate} className="gap-2">
                  <Download className="h-4 w-4" />
                  Descargar Plantilla Estándar
                </Button>
              </CardContent>
            </Card>

            {/* Step 2: Upload Standard File */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Paso 2: Subir Archivo
                </CardTitle>
                <CardDescription>
                  Sube el archivo Excel con los datos completos de los contratos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleStandardFileChange}
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
                        <p className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          {validationResult.valid.length} contratos válidos
                        </p>
                        {validationResult.errors.length > 0 && (
                          <p className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-600" />
                            {validationResult.errors.length} errores encontrados
                          </p>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Standard Validation Errors */}
            {validationResult && validationResult.errors.length > 0 && !uploadResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-destructive">Errores de Validación</CardTitle>
                  <CardDescription>
                    Corrige estos errores en el archivo Excel y vuelve a subirlo.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Fila</TableHead>
                        <TableHead className="w-40">Campo</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validationResult.errors.map((error, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono">{error.row}</TableCell>
                          <TableCell className="font-medium">{error.field}</TableCell>
                          <TableCell className="text-destructive">{error.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Confirm Standard Upload */}
            {validationResult && validationResult.valid.length > 0 && !uploadResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    Paso 3: Confirmar Carga
                  </CardTitle>
                  <CardDescription>
                    Se crearán {validationResult.valid.length} contratos.
                    {validationResult.errors.length > 0 && (
                      <span className="text-destructive"> Las filas con errores serán omitidas.</span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={handleStandardUpload} 
                    disabled={uploading}
                    className="gap-2"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creando contratos...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Crear {validationResult.valid.length} Contratos
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Standard Upload Results */}
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
                    {uploadResult.success} contratos creados, {uploadResult.failed} fallidos
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
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default BulkContractUpload;
