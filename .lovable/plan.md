

## Fix: Immutable tree update creating new references for all nodes

### Root Cause

In `BudgetModule.tsx`, the `updateInTree` function (lines 323-329) uses `.map()` which **always returns a new array**, and spreads every parent node `{ ...item, children: updateInTree(item.children) }` even when no descendant changed. This means:

- Every parent node gets a **new object reference**
- `React.memo` sees `prev.line !== next.line` as true for ALL parent nodes
- Result: the entire tree re-renders

The same problem exists in the percentage recalc `updateInTree` (lines 415-420).

Additionally, line 94 has `new Map()` as fallback which creates a new reference every render.

### Solution

Make `updateInTree` **structurally share unchanged subtrees** -- only create new objects for the edited node and its direct ancestors. If nothing changed in a subtree, return the original array reference.

### Technical Detail

**BudgetModule.tsx -- `applyLineUpdate` (lines 322-330)**:
```typescript
setLines(prev => {
  const updateInTree = (items: BudgetLine[]): BudgetLine[] => {
    let changed = false;
    const result = items.map(item => {
      if (item.id === id) {
        changed = true;
        return { ...item, ...data };
      }
      if (item.children?.length) {
        const newChildren = updateInTree(item.children);
        if (newChildren !== item.children) {
          changed = true;
          return { ...item, children: newChildren };
        }
      }
      return item;
    });
    return changed ? result : items;
  };
  return updateInTree(prev);
});
```

**BudgetModule.tsx -- `recalcPercentageLinesLocally` (lines 414-422)**:
Same pattern: only create new objects for nodes whose `amount_uf` actually changed.
```typescript
setLines(prev => {
  const updateInTree = (items: BudgetLine[]): BudgetLine[] => {
    let changed = false;
    const result = items.map(item => {
      const upd = updates.find(u => u.id === item.id);
      if (upd) {
        changed = true;
        return { ...item, amount_uf: upd.newAmount };
      }
      if (item.children?.length) {
        const newChildren = updateInTree(item.children);
        if (newChildren !== item.children) {
          changed = true;
          return { ...item, children: newChildren };
        }
      }
      return item;
    });
    return changed ? result : items;
  };
  return updateInTree(prev);
});
```

**BudgetLineTree.tsx -- line 94**:
Replace `new Map()` fallback with a module-level constant to avoid creating a new reference every render:
```typescript
// At module level (outside component)
const EMPTY_LINES_MAP = new Map<string, BudgetLine>();

// Line 94
const effectiveLinesMap = externalLinesMap || rootLinesMap || EMPTY_LINES_MAP;
```

### Files to modify
- `src/components/budget/BudgetModule.tsx` -- structural sharing in both `updateInTree` functions
- `src/components/budget/BudgetLineTree.tsx` -- stable empty Map fallback
