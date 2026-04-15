import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useGantt } from "@/hooks/useGantt";
import { GanttChart } from "./GanttChart";
import { GanttTaskTree } from "./GanttTaskTree";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, List, Plus, Loader2 } from "lucide-react";

interface GanttModuleProps {
  contractId: string;
}

export function GanttModule({ contractId }: GanttModuleProps) {
  const { isAdmin } = useAuth();
  const {
    timeline,
    tasks,
    taskTree,
    holidays,
    templates,
    loading,
    saving,
    createTimeline,
    addTask,
    updateTask,
    deleteTask,
    addDependency,
    removeDependency,
    linkPurchaseOrder,
    unlinkPurchaseOrder,
    reorderTask,
    reload,
  } = useGantt(contractId);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTimelineName, setNewTimelineName] = useState("Línea de Tiempo Principal");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const handleCreateTimeline = async () => {
    const result = await createTimeline(
      newTimelineName,
      selectedTemplateId || undefined
    );
    if (result) {
      setCreateDialogOpen(false);
      setNewTimelineName("Línea de Tiempo Principal");
      setSelectedTemplateId("");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // No timeline yet - show creation option
  if (!timeline) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Línea de Tiempo / Gantt
          </CardTitle>
          <CardDescription>
            Crea una línea de tiempo para planificar y hacer seguimiento del proyecto
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Crear Línea de Tiempo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Línea de Tiempo</DialogTitle>
                <DialogDescription>
                  Crea una nueva línea de tiempo para este contrato. Puedes partir desde una plantilla predefinida.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="timeline-name">Nombre</Label>
                  <Input
                    id="timeline-name"
                    value={newTimelineName}
                    onChange={(e) => setNewTimelineName(e.target.value)}
                    placeholder="Línea de Tiempo Principal"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Plantilla (opcional)</Label>
                  <Select
                    value={selectedTemplateId || "none"}
                    onValueChange={(value) => setSelectedTemplateId(value === "none" ? "" : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin plantilla - empezar vacío" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin plantilla</SelectItem>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreateTimeline}
                  disabled={saving || !newTimelineName.trim()}
                >
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Crear
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          {timeline.name}
        </CardTitle>
        <CardDescription>
          Línea de tiempo del proyecto con {tasks.length} tareas
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="chart" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="chart" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              Diagrama Gantt
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-2">
              <List className="h-4 w-4" />
              Lista de Tareas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chart">
            <GanttChart
              tasks={tasks}
              taskTree={taskTree}
              holidays={holidays}
              onUpdateTask={updateTask}
              onAddTask={addTask}
              onDeleteTask={deleteTask}
              onAddDependency={addDependency}
              onRemoveDependency={removeDependency}
              onReorderTask={reorderTask}
              isAdmin={isAdmin}
            />
          </TabsContent>

          <TabsContent value="list">
            <GanttTaskTree
              tasks={taskTree}
              allTasks={tasks}
              holidays={holidays}
              contractId={contractId}
              onAddTask={addTask}
              onUpdateTask={updateTask}
              onDeleteTask={deleteTask}
              onAddDependency={addDependency}
              onRemoveDependency={removeDependency}
              onLinkPurchaseOrder={linkPurchaseOrder}
              onUnlinkPurchaseOrder={unlinkPurchaseOrder}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
