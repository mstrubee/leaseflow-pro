

## Problem Analysis: CEBE Contract Matching is Fundamentally Broken

### Root Cause

The `MaintenanceExcelUpload.tsx` builds a map to match Excel contract references to database contracts using CEBE codes. The algorithm:

1. Takes each CEBE value (e.g., `H0423P1290`)
2. Extracts ALL numeric segments: `["0423", "1290"]`
3. Stores each number as a separate key in a `Map<string, contract>`

**The problem:** The suffix part (e.g., `1290`, `1390`) is shared across dozens of contracts:
- `1290` appears in 40+ CEBEs (Autoplanet contracts)
- `1390` appears in 15+ CEBEs (Agroplanet contracts)

This means the last contract processed with `1290` overwrites ALL previous entries for key `"1290"`. When the Excel row is parsed, if the raw text contains any number matching `"1290"`, it gets assigned to whichever contract happened to be processed last — completely wrong.

**Example:** Form 2247 should be "Puerto Varas" (CEBE `H04A2P1390`). The code extracts `["04", "2", "1390"]` from the Excel text. But `"1390"` maps to whichever Agroplanet contract was last inserted (e.g., "Melipilla (2026)"), and `"04"` is shared by every single contract.

### Fix: Two-Strategy Matching

**Strategy 1 - Direct name matching (primary):** Compare the Excel text against contract names directly. This is reliable and handles most cases.

**Strategy 2 - Full CEBE code matching (fallback):** Instead of splitting into individual numbers, match the FULL CEBE code (e.g., `H04A2P1390`) or the first unique numeric part (the 3-4 digit identifier like `0423`, `04A2`) against the Excel text.

### Technical Changes

**File: `src/components/maintenance/MaintenanceExcelUpload.tsx`**

1. **Build a name-based contract lookup map** — normalize contract names (lowercase, trim) and match against Excel column E text.

2. **Build a full-CEBE lookup map** — map the complete CEBE string (e.g., `H04A2P1390`) to contract, and also map the unique prefix portion (e.g., `H04A2`, `H0423`) as a secondary key.

3. **Remove the broken individual-number extraction** — delete the `nums.forEach(n => cebeToContract.set(n, ...))` logic entirely.

4. **Matching priority in row parsing:**
   - First: exact/partial name match (Excel text vs contract name)
   - Second: full CEBE code match (if Excel text contains a CEBE like `H04A2P1390`)
   - Third: unique CEBE prefix match (first numeric group only, e.g., `0423`)
   - If none match: warning as before

5. **Add a data repair step** — after fixing the upload logic, provide an option or query to identify and correct already-mismatched records in the database.

### Data Repair

A query to identify currently mismatched forms (forms where the stored `contract_name` doesn't correspond to the `contract_id`):

```sql
SELECT mf.form_number, mf.contract_name as stored_name, c.name as actual_name
FROM maintenance_forms mf
JOIN contracts c ON c.id = mf.contract_id
WHERE mf.deleted_at IS NULL
AND mf.contract_name != c.name
```

This returned 0 rows (the contract_name is being overwritten with the matched name), meaning the wrong contract_id is silently stored with no way to detect it post-upload. The fix must prevent this at upload time by improving match accuracy and showing the user what each row will be matched to before confirming.

