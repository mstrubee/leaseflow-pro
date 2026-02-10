

## Fix: Contract Matching for "La Florida 1" and "Valparaiso"

### Root Cause

Two bugs in the local matching logic in `MaintenanceExcelUpload.tsx`:

1. **No accent normalization**: "Valparaíso" (Excel, with accent) does not match "Valparaiso" (contract, without accent) via `.includes()`.
2. **No local 4-digit CEBE matching**: The Excel text "0410 TIENDA LA FLORIDA" contains `0410`, which corresponds to CEBE `H0410P1290` (digits 2-5 = `0410`). But the current prefix match looks for `H0410` which isn't in the Excel text. There's no step that extracts just the leading digits from the Excel and compares them to CEBE positions 2-5.
3. **Ambiguous name match**: Three contracts contain "la florida", so name-only matching picks the wrong one.

### Solution

Add two improvements to the local matching in `matchContract()`, before falling back to AI:

**1. Accent normalization utility**

Add a `normalize()` helper that strips diacritics:
```typescript
const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
```

Apply it in the name matching step so "valparaíso" matches "valparaiso".

**2. New Priority 2.5: Local 4-digit CEBE match**

Between the current full-CEBE match and the prefix match, add a step that:
- Extracts the first 4-digit number from the Excel text (e.g., `0410` from "0410 TIENDA LA FLORIDA")
- Compares it against digits 2-5 of each contract's CEBE (e.g., `H0410P1290` positions 1-4 = `0410`)
- If exactly ONE contract matches on digits AND the name has partial overlap, return that contract
- If multiple contracts match on digits (e.g., multiple "0410" CEBEs), use name similarity to disambiguate

**3. Build a cebeDigits-to-contracts map**

During the CEBE loading phase, also build a `Map<string, Array<{id, name}>>` keyed by the 4 digits at positions 2-5 of each CEBE. This allows fast lookup.

### Technical Changes

**File: `src/components/maintenance/MaintenanceExcelUpload.tsx`**

- Add `normalize()` function for accent-insensitive comparison
- Update Priority 1 (name matching) to use `normalize()` on both sides
- Build `contractsByDigits` map (CEBE[1..5] as 4-char key to array of contracts)
- Add Priority 2.5: extract leading 4 digits from Excel text, look up in `contractsByDigits`, disambiguate by normalized name if multiple matches
- Keep existing AI fallback as last resort (unchanged)

### Updated Matching Priority

```text
1. Name match (now accent-normalized)
2. Full CEBE in text (e.g., "H04A2P1390")
3. 4-digit CEBE match (NEW: "0410" vs CEBE[1..5])
   - If 1 match: use it
   - If multiple: pick best by name similarity
4. CEBE prefix match (e.g., "H04A2")
5. AI fallback (edge function)
6. Warning: "Contrato no encontrado"
```
