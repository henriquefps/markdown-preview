# ADR 1: Responsive Layout, Collapsible Editor, and PDF Print Fixes

* **Date**: 2026-06-15
* **Status**: Accepted

## Context

The Markdown Previewer app had two major usability and display issues:
1. **PDF Export clipping**: Any document rendered inside the previewer was being truncated at the first page boundary when exported to PDF. This was caused by the CSS rule `tr { page-break-inside: avoid; }` under `@media print`, which matched the layout wrapper table `.print-layout-table`, forcing the browser to prevent breaks within the entire content.
2. **Missing single-pane views & mobile responsiveness**: On desktop, the layout was locked in split-screen mode. On mobile, the workspace was crowded due to the header buttons overflowing, and the split layout was too narrow to be usable.

## Decision

We made the following architectural and CSS changes:
1. **Targeted page breaks**: Restructured the print stylesheet rule to target only table rows in user-authored markdown content: `.markdown-body table tr { page-break-inside: avoid; }`.
2. **Overrode flex layout constraints during print**: Forced `.workspace` and `.preview-container` to `height: auto !important; overflow: visible !important; display: block !important;` in the printing stylesheet so page breaks flow naturally.
3. **Segmented View Switcher**: Added a view mode controller (`activeTab` state) in the header, letting users choose "Editor", "Split", or "Preview" on both desktop and mobile. 
4. **Mobile Adaptations**:
   - Disabled the "Split" view on screen widths $\le 768\text{px}$ to save space.
   - Set the default view mode on mobile to "Editor".
   - Hided text labels on header buttons (such as theme and settings) for screens $\le 768\text{px}$, keeping only the icons.

## Consequences

* **PDF Export**: Long documents now paginate correctly without clipping.
* **Layout flexibility**: Users can now collapse the editor to view only the preview on desktop.
* **Mobile Experience**: Header fits comfortably without wrapping, and the interface automatically transitions into a single-column edit-first interface.
