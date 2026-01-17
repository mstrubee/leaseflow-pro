import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
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
import { Edit, MoreVertical, Trash2, Download, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { BusinessCase } from "@/hooks/useBusinessCase";
import { Skeleton } from "@/components/ui/skeleton";

interface BusinessCaseListProps {
  businessCases: BusinessCase[];
  loading: boolean;
  onEdit: (bc: BusinessCase) => void;
  onDelete: (id: string) => void;
  onExport: (bc: BusinessCase) => void;
}

export const BusinessCaseList: React.FC<BusinessCaseListProps> = ({
  businessCases,
  loading,
  onEdit,
  onDelete,
  onExport
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [selectedBCId, setSelectedBCId] = React.useState<string | null>(null);

  const handleDeleteClick = (id: string) => {
    setSelectedBCId(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedBCId) {
      onDelete(selectedBCId);
    }
    setDeleteDialogOpen(false);
    setSelectedBCId(null);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-8 w-8" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (businessCases.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            No hay Business Cases guardados para este contrato.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Crea uno nuevo o importa desde un archivo Excel.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {businessCases.map((bc) => (
          <Card 
            key={bc.id} 
            className="hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => onEdit(bc)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                    <h4 className="font-medium truncate">{bc.name}</h4>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {format(new Date(bc.created_at), "d MMM yyyy", { locale: es })}
                    </Badge>
                    {bc.updated_at !== bc.created_at && (
                      <span className="text-xs text-muted-foreground">
                        Modificado: {format(new Date(bc.updated_at), "d MMM yyyy HH:mm", { locale: es })}
                      </span>
                    )}
                  </div>
                </div>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(bc); }}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onExport(bc); }}>
                      <Download className="h-4 w-4 mr-2" />
                      Exportar Excel
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={(e) => { e.stopPropagation(); handleDeleteClick(bc.id); }}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar Business Case?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El Business Case será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
