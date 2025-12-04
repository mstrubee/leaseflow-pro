import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Plus } from "lucide-react";
import { AlertForm } from "@/components/alerts/AlertForm";
import { AlertsList } from "@/components/alerts/AlertsList";
import { FinalizedAlertsList } from "@/components/alerts/FinalizedAlertsList";

interface ContractAlertsProps {
  contractId: string;
  contractName: string;
  expirationDate?: Date;
}

export function ContractAlerts({ contractId, contractName, expirationDate }: ContractAlertsProps) {
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Alertas y Recordatorios
        </CardTitle>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva alerta
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <AlertForm
            contractId={contractId}
            contractName={contractName}
            initialDueDate={expirationDate}
            onSuccess={() => {
              setShowForm(false);
              setRefreshKey(k => k + 1);
            }}
            onCancel={() => setShowForm(false)}
          />
        )}
        
        <AlertsList 
          key={refreshKey}
          contractId={contractId} 
          onRefresh={() => setRefreshKey(k => k + 1)}
          showOnlyActive={true}
        />

        <FinalizedAlertsList 
          key={`finalized-${refreshKey}`}
          contractId={contractId}
        />
      </CardContent>
    </Card>
  );
}