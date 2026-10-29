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
        onReportUpdated={(patch) => setSelected((r) => (r ? { ...r, ...patch } : r))}
      />
    );
  }

  return <ExpenseReportsList key={refreshKey} onSelectReport={setSelected} />;
}
