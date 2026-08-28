---
name: large-dataset-virtualization
description: Large dataset virtualization patterns for React desktop apps. Handles rendering 10,000+ inventory items, instant POS filtering, debounced search, and low-latency DOM updates.
---

# Large Dataset Virtualization Skill

This skill provides optimization techniques for high-volume product catalogs and large transaction histories.

## Core Optimization Techniques
1. **Windowed List Rendering**: Use `react-window` (`FixedSizeList` / `VariableSizeList`) when rendering product lists exceeding 100 items to keep DOM node count low.
2. **Debounced Search Indexing**: Wrap live search inputs in a `useDebounce` hook (200-300ms) to avoid expensive recalculations on every keystroke.
3. **Memoized Query Projections**: Use React `useMemo` to cache filtered and sorted product arrays based on search terms and active categories.
4. **Selective Component Re-rendering**: Wrap item rows in `React.memo` with custom prop comparison functions to prevent unnecessary re-renders when list state updates.
