import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Check, Star } from "lucide-react";
import { format } from "date-fns";

export interface DocumentVersion {
  id: string;
  document_type: string;
  url: string;
  uploaded_at: string;
  version_id: string | null;
}

interface DocumentVersionsProps {
  documents: DocumentVersion[];
  contractName: string;
  onAddDocument: (url: string, name: string) => Promise<void>;
  onMarkAsFinal: (docId: string) => Promise<void>;
  readOnly?: boolean;
}

export const DocumentVersions = ({
  documents,
  contractName,
  onAddDocument,
  onMarkAsFinal,
  readOnly = false,
}: DocumentVersionsProps) => {
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);

  const generateSuggestedName = () => {
    const today = format(new Date(), "yyyy.MM.dd");
    const versionNumber = documents.filter(d => d.document_type === "borrador").length + 1;
    return `${today} ${contractName} V_${versionNumber}`;
  };

  const handleUseSuggested = () => {
    setNewName(generateSuggestedName());
  };

  const handleAdd = async () => {
    if (!newUrl) return;
    setLoading(true);
    try {
      await onAddDocument(newUrl, newName || generateSuggestedName());
      setNewUrl("");
      setNewName("");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("es-CL", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDocumentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      borrador: "Borrador",
      borrador_final: "Versión Final",
      firmado: "Firmado",
    };
    return labels[type] || type;
  };

  const getDocumentTypeBadge = (type: string) => {
    if (type === "borrador_final") {
      return <Badge className="bg-status-signed text-white"><Star className="h-3 w-3 mr-1" />Final</Badge>;
    }
    if (type === "firmado") {
      return <Badge className="bg-primary text-primary-foreground"><Check className="h-3 w-3 mr-1" />Firmado</Badge>;
    }
    return <Badge variant="secondary">Borrador</Badge>;
  };

  const sortedDocuments = [...documents].sort(
    (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
  );

  const hasFinalVersion = documents.some(d => d.document_type === "borrador_final" || d.document_type === "firmado");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Historial de Versiones
        </CardTitle>
        <CardDescription>
          Registro de todas las versiones del documento
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Document list */}
        {sortedDocuments.length > 0 ? (
          <div className="space-y-3">
            {sortedDocuments.map((doc, index) => (
              <div
                key={doc.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  doc.document_type === "borrador_final" 
                    ? "bg-status-signed/10 border-status-signed/30" 
                    : "bg-muted/30 border-border"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {getDocumentTypeBadge(doc.document_type)}
                    <span className="text-xs text-muted-foreground">
                      #{sortedDocuments.length - index}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {formatDate(doc.uploaded_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!readOnly && doc.document_type === "borrador" && !hasFinalVersion && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onMarkAsFinal(doc.id)}
                      className="gap-1"
                    >
                      <Star className="h-3 w-3" />
                      Marcar Final
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(doc.url, "_blank")}
                  >
                    Ver
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay versiones registradas
          </p>
        )}

        {/* Add new version */}
        {!readOnly && (
          <div className="space-y-4 pt-4 border-t border-border">
            <Label>Agregar nueva versión</Label>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Nombre del documento (opcional)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleUseSuggested}
                >
                  Sugerir
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Formato sugerido: {generateSuggestedName()}
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="URL del documento (Google Drive, OneDrive, etc.)"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  type="url"
                  className="flex-1"
                />
                <Button
                  type="button"
                  onClick={handleAdd}
                  disabled={!newUrl || loading}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Agregar
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
