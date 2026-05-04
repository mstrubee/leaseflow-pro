## Goal

Add a discrete eye-icon button ("Lines OFF") on each contract card in the Gantt reports section. When activated, checkboxes appear next to each row of the mini-Gantt, letting the user toggle visibility of individual lines.

## Behavior rules

- Eye icon button: ghost variant, icon-only (`Eye` / `EyeOff` from lucide-react), tooltip "Lines OFF".
- Click toggles "selection mode" for that card only (state stored per `contractId`).
- In selection mode, a small checkbox column appears on the left of each row of `MiniGantt`. All rows start checked.
- Unchecking a row removes that row from the visualization.
- **Parent off → all descendants are hidden by default** (cascade visually: hiding parent hides its subtree from the rendered list).
- **Child off → parent row remains and its bar still spans the full duration** including the hidden children. Since the parent's `start_date`/`end_date` are stored on the task itself (not derived), the bar already reflects total duration; no recalculation needed. Just hide the child rows but keep the parent.
- Date axis (minDate/maxDate) stays computed from the full task set so the timeline doesn't shrink when rows are hidden — keeps comparison stable.

## Implementation

File: `src/components/gantt/GanttReportsSection.tsx`

1. **State in parent** (`GanttReportsSection`): `const [hiddenByCard, setHiddenByCard] = useState<Record<string, Set<string>>>({})` and `const [selectionModeCards, setSelectionModeCards] = useState<Set<string>>(new Set())`.

2. **Eye button** in each card header (next to "Ir al proyecto"):
   ```
   <Button variant="ghost" size="icon" className="h-7 w-7"
           onClick={(e) => { e.stopPropagation(); toggleSelectionMode(item.contractId); }}
           title="Lines OFF">
     {selectionModeCards.has(item.contractId) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
   </Button>
   ```

3. **Pass props to `MiniGantt`**: `selectionMode`, `hiddenIds: Set<string>`, `onToggleHidden(id)`.

4. **Inside `MiniGantt`**:
   - Compute axis range from full `flat` (unchanged).
   - Build a `visibleFlat` by walking the tree: skip a node if its id is in `hiddenIds`, **and skip its entire subtree** (don't descend into hidden parents). Children of visible parents remain visible unless individually hidden.
   - When `selectionMode` is true, render a 28px-wide checkbox column before the name column (header gets an empty cell). Use the existing `Checkbox` component from `@/components/ui/checkbox`.
   - Render rows from `visibleFlat`. The parent's bar uses its own stored `start_date`/`end_date`, so it already covers the full span even when its children are hidden — no extra logic needed.

5. **Helper**: replace direct `flattenTree(taskTree)` with a filtered variant that prunes subtrees whose root is hidden:
   ```ts
   const flattenVisible = (tree, hidden, level=0, acc=[]) => {
     tree.forEach(t => {
       if (hidden.has(t.id)) return; // skip node + subtree
       acc.push({ task: t, level });
       if (t.children?.length) flattenVisible(t.children, hidden, level+1, acc);
     });
     return acc;
   };
   ```

6. State is in-memory only (resets on page reload); not persisted. PDF export remains unaffected (continues exporting the full tree).

## Out of scope

- No persistence of hidden selections.
- No change to the full Gantt page in `ContractDetail` (only the reports mini view).
- No change to PDF export behavior.
