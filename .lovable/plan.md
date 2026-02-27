

## Fix: PDF exports only selected contracts

### Problem
The current "Filas PDF" selector uses an **exclusion model** -- all contracts start as included, and you must manually uncheck each one you don't want. When you have many contracts and search to find specific ones, the contracts hidden by the search filter remain included. This makes it appear the PDF "shows everything."

### Solution
Add a console log for debugging AND change the PDF export to log the count of excluded/included contracts so we can verify the filtering is working. More importantly, improve the UX so the user can easily select only specific contracts:

1. **Add "Ninguno" as default hint** -- When the popover opens, show a clearer message explaining the user can click "Ninguno" first, then select only the contracts they want.

2. **Add logging to PDF export** -- Temporarily add a `console.log` in both `handleDownloadReport` (Contracts.tsx) and `exportSinPatentePDF` (ReportsDashboard.tsx) to verify the filtering is executing.

3. **Add a toast notification** -- When the PDF is generated, show a toast confirming how many contracts were included (e.g., "PDF generado con 1 de 45 contratos").

### Technical Details

**Files to modify:**

- **`src/pages/Contracts.tsx`** (handleDownloadReport):
  - Add toast notification showing count of included contracts
  - Add console.log for debugging

- **`src/pages/ReportsDashboard.tsx`** (exportSinPatentePDF):
  - Add toast notification showing count of included contracts
  - Add console.log for debugging

- **`src/components/contracts/ContractRowSelector.tsx`**:
  - Add a visual indicator showing "X de Y seleccionados" more prominently on the trigger button
  - This helps the user understand at a glance whether their selection is active

### Expected Result
The user will see exactly how many contracts are being exported, and the button will clearly show when not all contracts are selected, making it obvious if the selection is active or not.

