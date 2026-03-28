import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Database, 
  HardDrive, 
  RefreshCw, 
  FileText, 
  Image, 
  FileArchive,
  File,
  AlertTriangle,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

// Storage limits for Lovable Cloud
const DATABASE_LIMIT_MB = 500;
const FILE_STORAGE_LIMIT_GB = 1;
const FILE_STORAGE_LIMIT_BYTES = FILE_STORAGE_LIMIT_GB * 1024 * 1024 * 1024;

interface TableCount {
  name: string;
  label: string;
  count: number;
}

interface FileTypeBreakdown {
  type: string;
  label: string;
  icon: React.ElementType;
  count: number;
  sizeBytes: number;
}

interface StorageStats {
  database: {
    tables: TableCount[];
    totalRecords: number;
    estimatedSizeMB: number;
  };
  files: {
    totalCount: number;
    totalSizeBytes: number;
    byType: FileTypeBreakdown[];
  };
}

// Estimated average record size in bytes (rough estimation)
const ESTIMATED_BYTES_PER_RECORD = 500;

const TABLES_TO_MONITOR: { name: string; label: string }[] = [
  { name: "contracts", label: "Contratos" },
  { name: "suppliers", label: "Proveedores" },
  { name: "purchase_orders", label: "Órdenes de Compra" },
  { name: "invoices", label: "Facturas" },
  { name: "budget_lines", label: "Líneas de Presupuesto" },
  { name: "alerts", label: "Alertas" },
  { name: "repository_files", label: "Archivos Repositorio" },
  { name: "repository_folders", label: "Carpetas Repositorio" },
  { name: "gantt_tasks", label: "Tareas Gantt" },
  { name: "kpis", label: "KPIs" },
  { name: "user_preferences", label: "Preferencias Usuario" },
  { name: "profiles", label: "Perfiles" },
];

function getFileTypeInfo(filename: string): { type: string; label: string; icon: React.ElementType } {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  if (['pdf'].includes(ext)) {
    return { type: 'pdf', label: 'PDF', icon: FileText };
  }
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
    return { type: 'image', label: 'Imágenes', icon: Image };
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { type: 'archive', label: 'Archivos Comprimidos', icon: FileArchive };
  }
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods'].includes(ext)) {
    return { type: 'office', label: 'Documentos Office', icon: FileText };
  }
  return { type: 'other', label: 'Otros', icon: File };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getStatusColor(percentage: number): { color: string; icon: React.ElementType; textClass: string } {
  if (percentage < 50) {
    return { color: 'hsl(var(--chart-2))', icon: CheckCircle2, textClass: 'text-green-600' };
  }
  if (percentage < 80) {
    return { color: 'hsl(var(--chart-4))', icon: AlertCircle, textClass: 'text-yellow-600' };
  }
  return { color: 'hsl(var(--chart-1))', icon: AlertTriangle, textClass: 'text-red-600' };
}

interface StorageMonitorProps {
  defaultCollapsed?: boolean;
}

export function StorageMonitor({ defaultCollapsed = false }: StorageMonitorProps) {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    setRefreshing(true);
    try {
      // Fetch counts for all tables in parallel
      const tablePromises = TABLES_TO_MONITOR.map(async (table) => {
        const { count, error } = await supabase
          .from(table.name as any)
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          console.error(`Error counting ${table.name}:`, error);
          return { name: table.name, label: table.label, count: 0 };
        }
        return { name: table.name, label: table.label, count: count || 0 };
      });

      const tableCounts = await Promise.all(tablePromises);
      const totalRecords = tableCounts.reduce((sum, t) => sum + t.count, 0);
      const estimatedSizeMB = (totalRecords * ESTIMATED_BYTES_PER_RECORD) / (1024 * 1024);

      // Fetch file storage stats
      const { data: files, error: filesError } = await supabase.storage
        .from('repository-files')
        .list('', { limit: 1000 });

      let fileStats = {
        totalCount: 0,
        totalSizeBytes: 0,
        byType: [] as FileTypeBreakdown[],
      };

      if (!filesError && files) {
        // Recursively list all files (including nested folders)
        const allFiles = await listAllFiles('repository-files', '');
        
        const typeMap = new Map<string, FileTypeBreakdown>();
        
        allFiles.forEach((file) => {
          const typeInfo = getFileTypeInfo(file.name);
          const existing = typeMap.get(typeInfo.type);
          const size = file.metadata?.size || 0;
          
          if (existing) {
            existing.count++;
            existing.sizeBytes += size;
          } else {
            typeMap.set(typeInfo.type, {
              type: typeInfo.type,
              label: typeInfo.label,
              icon: typeInfo.icon,
              count: 1,
              sizeBytes: size,
            });
          }
        });

        fileStats = {
          totalCount: allFiles.length,
          totalSizeBytes: allFiles.reduce((sum, f) => sum + (f.metadata?.size || 0), 0),
          byType: Array.from(typeMap.values()).sort((a, b) => b.sizeBytes - a.sizeBytes),
        };
      }

      setStats({
        database: {
          tables: tableCounts.sort((a, b) => b.count - a.count),
          totalRecords,
          estimatedSizeMB,
        },
        files: fileStats,
      });
    } catch (error) {
      console.error('Error loading storage stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const listAllFiles = async (bucket: string, path: string): Promise<any[]> => {
    const { data, error } = await supabase.storage.from(bucket).list(path, { limit: 1000 });
    
    if (error || !data) return [];
    
    const files: any[] = [];
    
    for (const item of data) {
      if (item.id) {
        // It's a file
        files.push(item);
      } else {
        // It's a folder, recurse
        const nestedPath = path ? `${path}/${item.name}` : item.name;
        const nestedFiles = await listAllFiles(bucket, nestedPath);
        files.push(...nestedFiles);
      }
    }
    
    return files;
  };

  if (loading) {
    return (
      <CollapsibleCard
        title="Monitoreo de Almacenamiento"
        description="Uso de base de datos y archivos en Lovable Cloud"
        icon={<Database className="h-5 w-5 text-cyan-600" />}
        defaultOpen={!defaultCollapsed}
      >
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </CollapsibleCard>
    );
  }

  if (!stats) {
    return (
      <CollapsibleCard
        title="Monitoreo de Almacenamiento"
        description="Uso de base de datos y archivos en Lovable Cloud"
        icon={<Database className="h-5 w-5 text-cyan-600" />}
        defaultOpen={!defaultCollapsed}
      >
        <p className="text-muted-foreground">Error al cargar estadísticas</p>
      </CollapsibleCard>
    );
  }

  const dbPercentage = Math.min((stats.database.estimatedSizeMB / DATABASE_LIMIT_MB) * 100, 100);
  const filesPercentage = Math.min((stats.files.totalSizeBytes / FILE_STORAGE_LIMIT_BYTES) * 100, 100);
  
  const dbStatus = getStatusColor(dbPercentage);
  const filesStatus = getStatusColor(filesPercentage);

  return (
    <CollapsibleCard
      title="Monitoreo de Almacenamiento"
      description="Uso de base de datos y archivos en Lovable Cloud"
      icon={<Database className="h-5 w-5 text-cyan-600" />}
      defaultOpen={!defaultCollapsed}
      headerActions={
        <Button
          variant="outline"
          size="sm"
          onClick={loadStats}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
          Actualizar
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Database Usage Card */}
        <div className="border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-medium">Base de Datos</h3>
            </div>
            <div className={cn("flex items-center gap-1", dbStatus.textClass)}>
              <dbStatus.icon className="h-4 w-4" />
              <span className="text-sm font-medium">{dbPercentage.toFixed(1)}%</span>
            </div>
          </div>
          
          <div className="space-y-2">
            <Progress value={dbPercentage} className="h-2" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>~{stats.database.estimatedSizeMB.toFixed(2)} MB usado</span>
              <span>Límite: {DATABASE_LIMIT_MB} MB</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {stats.database.tables.slice(0, 8).map((table) => (
              <div
                key={table.name}
                className="bg-muted/50 rounded-md p-2 text-center"
              >
                <p className="text-lg font-semibold">{table.count.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground truncate">{table.label}</p>
              </div>
            ))}
          </div>
          
          <p className="text-xs text-muted-foreground text-center">
            Total: {stats.database.totalRecords.toLocaleString()} registros
          </p>
        </div>

        {/* File Storage Card */}
        <div className="border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-medium">Almacenamiento de Archivos</h3>
            </div>
            <div className={cn("flex items-center gap-1", filesStatus.textClass)}>
              <filesStatus.icon className="h-4 w-4" />
              <span className="text-sm font-medium">{filesPercentage.toFixed(1)}%</span>
            </div>
          </div>
          
          <div className="space-y-2">
            <Progress value={filesPercentage} className="h-2" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{formatBytes(stats.files.totalSizeBytes)} usado</span>
              <span>Límite: {FILE_STORAGE_LIMIT_GB} GB</span>
            </div>
          </div>

          {stats.files.byType.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {stats.files.byType.map((type) => {
                const Icon = type.icon;
                return (
                  <div
                    key={type.type}
                    className="bg-muted/50 rounded-md p-2 flex items-center gap-2"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{type.count} archivos</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {type.label} ({formatBytes(type.sizeBytes)})
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              No hay archivos almacenados
            </p>
          )}
          
          <p className="text-xs text-muted-foreground text-center">
            Total: {stats.files.totalCount} archivos
          </p>
        </div>

        {/* Info Footer */}
        <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground">
          <p className="flex items-center gap-1 mb-1">
            <CheckCircle2 className="h-3 w-3 text-green-600" />
            <span>&lt; 50%: Uso saludable</span>
          </p>
          <p className="flex items-center gap-1 mb-1">
            <AlertCircle className="h-3 w-3 text-yellow-600" />
            <span>50-80%: Considerar optimización</span>
          </p>
          <p className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-red-600" />
            <span>&gt; 80%: Límite cercano, acción requerida</span>
          </p>
        </div>
      </div>
    </CollapsibleCard>
  );
}
