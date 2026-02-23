

## ✅ DONE: Immutable tree update - structural sharing

Applied structural sharing in both `updateInTree` functions in `BudgetModule.tsx` so only the edited node and its direct ancestors get new references. Added stable `EMPTY_LINES_MAP` constant in `BudgetLineTree.tsx`.

Combined with the previous `linesMap` + custom `React.memo` comparator changes, only the edited line and its ancestors should re-render now.
