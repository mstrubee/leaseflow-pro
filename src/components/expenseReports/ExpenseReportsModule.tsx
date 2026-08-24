import { useState } from "react";
import { ExpenseReportsList } from "./ExpenseReportsList";
import { ExpenseReportDetail } from "./ExpenseReportDetail";
import type { ExpenseReport } from "./expenseReportsTypes";

export function ExpenseReportsModule() {
  const [selected, setSelected] = useState<ExpenseReport | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  if (selected) {
    return (
      <ExpenseReportDetail
        report={selected}
        onBack={() => {
          setSelected(null);
          setRefreshKey((k) => k + 1);
        }}
        onReportUpdated={() => setSelected((r) => (r ? { ...r, status: "enviado", sent_at: new Date().toISOString() } : r))}
      />
    );
  }

  return <ExpenseReportsList key={refreshKey} onSelectReport={setSelected} />;
}
