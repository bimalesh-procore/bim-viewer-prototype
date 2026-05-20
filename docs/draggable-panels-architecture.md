# Draggable / Dockable Panels — Portable Architecture

> **Purpose:** Describe the panel system (display, drag, drop, dock, undock, float, resize, detach to OS window) in an **implementation-agnostic** way so it can be rebuilt on a live codebase whose framework / state layer / viewer engine is different from this prototype.
>
> **Context:** Originally requested under `requirements/Cross_Feature_Dependencies.md` → §5 *Draggable Windows* (Medium priority): "Ability to drag, resize, and reposition UI panels/windows within the application. Affects multiple feature areas that use panels (2D Overlay panel, Model Views panel, Searchset panel, etc.)."
>
> **Reference implementation in this repo:** `src/chrome/features/dock-manager/`
> (`useDockStore.ts`, `DockManager.tsx`, `DockedPanel.tsx`, `DetachedPanelPortal.tsx`, `usePopupWindow.ts`, `panelContent.tsx`).

---

## 1. Feature Summary

A panel can exist in exactly one of **four runtime states**, and must be able to transition between them without content being unmounted or losing state:


| State         | Where it renders                                    | Typical trigger                                                 |
| ------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| **Docked**    | In a vertical dock rail anchored to a screen edge   | Toolbar button toggle, or dropped onto dock zone                |
| **Floating**  | Free-positioned overlay inside the app viewport     | Dragged out of dock, or opened as floating                      |
| **Minimized** | Collapsed to header-only (still docked or floating) | Header minimize button                                          |
| **Detached**  | Inside a native OS popup window                     | "Open in new window" button, or dragged outside viewport bounds |


Additional capabilities:

- Re-order docked panels by drag.
- Resize docked panels vertically (shares available height with flex siblings).
- Resize floating panels vertically (bottom edge) and bidirectionally (corner handle).
- Drop a floating panel onto the dock rail with a live insertion preview.
- Return a detached popup window back into the dock.
- Close a panel entirely (removes from state).

---

## 2. Core Data Model

A single store owns an ordered list of *open* panels. Closed panels are absent from the list.

```ts
type PanelId = string; // stable identifier per panel type (e.g. 'properties')

interface PanelState {
  id: PanelId;
  label: string;

  // Runtime mode (mutually exclusive):
  //   docked  && !detached  → docked rail
  //   !docked && !detached  → floating
  //   detached              → OS popup window
  docked: boolean;
  detached: boolean;
  minimized: boolean;

  // Floating-mode geometry:
  floatPosition: { x: number; y: number };
  floatWidth?: number;
  floatHeight?: number;

  // Docked-mode geometry:
  // undefined = flex share; number = user-resized fixed height.
  dockedHeight?: number;
}
```

### Store operations (framework-agnostic contract)

```ts
interface DockStore {
  openPanels: PanelState[];

  togglePanel(id, label): void;            // open if closed, close if open
  ensurePanel(id, label): void;            // open if closed, no-op if already open

  undockPanel(id, pos): void;              // docked → floating at pos
  insertDockedPanel(id, insertIndex): void;// floating → docked at index
  reorderDockedPanels(orderedIds): void;   // reorder within dock

  setFloatPosition(id, pos): void;
  setFloatSize(id, { width?, height? }): void;
  setDockedHeight(id, height): void;

  toggleMinimized(id): void;
  closePanel(id): void;

  detachPanel(id): void;                   // → OS popup window
  reattachPanel(id): void;                 // popup window → docked
}
```

**Invariants:**

- Order of `openPanels` preserves **docked order** (used as the visible rail order).
- Docked height semantics:
  - `minimized` → fixed `MINIMIZED_PANEL_HEIGHT` (header-only).
  - `dockedHeight` set → that exact fixed height.
  - `dockedHeight` undefined → flex share of remaining vertical space.
- `insertDockedPanel` and `reattachPanel` must clear `dockedHeight` for all previously-docked panels so the newly inserted panel redistributes space cleanly.

This repo uses React `useState` + callbacks; any reactive store (Zustand, Redux, signals, observable) satisfies the contract. It does not need to be global — it can live at the layout root.

---

## 3. Visual Architecture: Dock Zone + Panels

### 3.1 Dock zone

A single fixed-width, full-height **vertical flex column** positioned at the screen edge just inside the toolbar:

```txt
left    = TOOLBAR_RIGHT_EDGE + DOCK_GAP
top     = EDGE_MARGIN
bottom  = EDGE_MARGIN
width   = DOCK_PANEL_WIDTH   (e.g. 320)
display = flex; flex-direction: column; gap: PANEL_GAP (e.g. 8)
pointer-events: none         (the zone is a layout container only; children re-enable)
```

The dock zone is **hidden** (`visibility: hidden`) when no panels are docked AND there is no active floating-over-dock drag preview. Keeping it mounted avoids measuring flicker.

### 3.2 Panel slot wrapper

Every docked panel is wrapped in a **slot** div — the slot owns layout height and drag-related transforms; the panel content itself never knows about layout:

```txt
<div
  key={panel.id}                      // id-based key — never array index
  data-panel-slot={panel.id}
  style={{
    height: <frozen-or-natural>,      // see §3.3
    transform: translateY(<sibling displacement>),
    transition: transform only,       // never transition height/top/margin
    opacity: <1 or 0 if placeholder>,
    pointerEvents: <auto or none if placeholder>,
    willChange: 'transform',
  }}
>
  {!isPlaceholder && <Panel …/>}       // placeholder slots have NO children
</div>
```

### 3.3 Height model

Docked heights are recomputed every render as:

```
fixedTotal = Σ (minimized ? MINIMIZED_H : dockedHeight ?? 0)
flexCount  = count(not minimized && dockedHeight == null)
flexH      = (zoneHeight - fixedTotal - gaps) / flexCount
naturalH(p) =
  p.minimized       ? MINIMIZED_H :
  p.dockedHeight    ? p.dockedHeight :
                      flexH
```

During a drag, **every slot's height is frozen** to its measured `offsetHeight` at drag start. Content reflow inside a panel during a drag must never move its siblings.

### 3.4 Floating panels

A floating panel is rendered at `position: fixed`, owns its own `left/top/width/height`, and has:

- Resting shadow when docked (`0 1px 4px … , 0 4px 12px …`).
- Stronger floating shadow when floating.
- Lifted shadow while being dragged.

### 3.5 Panel header and chrome

Every panel shares a single component (`DockedPanel.tsx` in this repo) that renders:

- Drag handle = the entire header (`onPointerDown = onDragStart`), except action buttons (which `stopPropagation`).
- Controls: minimize/expand, detach (open-in-window), add (feature-specific), close.
- Optional subheader, tabs row, toolbar row.
- Content region (`flex: 1; overflow: auto; min-height: 0`).
- Resize handles (bottom edge for docked/floating; corner for floating-only).

---

## 4. Drag Lifecycle

The single hardest problem in this system is making drag + reorder + drop look seamless without content jumping. The rules below are what made it work — they are non-negotiable.

### 4.1 Core principle

> **Animate only `transform`. Never animate `height`, `top`, `margin`, `padding`, or `flex-basis`.**
>
> Layout properties interact with flex redistribution in ways that cause double-shift and ghosting during reorder.

### 4.2 Three phases

```
idle → drag → drop → idle
              (overlay animates; inputs frozen)
```

#### `drag` phase (pointer-tracking)

1. **On `pointerdown` on a panel header:**
  - Record the dragged panel's original index in the docked list.
  - Measure and freeze the height of every docked slot into a `Map<PanelId, number>`.
  - Capture the panel's current client rect (`overlayX`, `overlayY`) and the pointer offset inside it.
  - Swap the dragged panel's slot into **placeholder mode**: `opacity: 0`, no children. The slot keeps its frozen height so the flex stack doesn't collapse.
  - Mount a separate **overlay element** at `position: fixed; left: 0; top: 0` with `transform: translate(overlayX, overlayY)` rendering the *actual* panel. The overlay is the visual thing the user drags.
  - Add global `pointermove` / `pointerup` listeners (on `window`). Do not use the React synthetic events for motion — the pointer will leave the element.
2. **On `pointermove`:**
  - Update `overlayX/Y` (drives overlay transform).
  - Compute `overDock` = is the pointer inside the dock zone (with a small hit-zone margin, e.g. 32px horizontal / 20px vertical)?
  - If `overDock`, compute `insertIndex` by comparing `cursorY` against each non-dragged slot's `offsetTop` (natural position — **do not** use `getBoundingClientRect()` because displaced siblings will skew the result):
    ```
    idx = 0
    for each sibling slot (excluding dragged):
      if (cursorY >= zoneTop + slot.offsetTop) idx++
    ```
  - Apply **sibling displacement** via CSS transform on non-dragged slots:
    - Reorder (originally docked): siblings between `originalIndex` and `insertIndex` shift up (by dragged span) or down to preview the new order.
    - Insertion (originally floating hovering dock): siblings at and below `insertIndex` shift down by the incoming panel's preview height.
  - Sibling `transform` changes are the only animated property, with `transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1)`.

#### `drop` phase (on `pointerup`)

Four outcomes, determined by drag origin and pointer location:


| Started… | Ended…                        | Action                                                                |
| -------- | ----------------------------- | --------------------------------------------------------------------- |
| Docked   | Over dock                     | **Reorder within dock** (animated overlay → target slot, then commit) |
| Docked   | Outside dock, inside viewport | **Undock** → floating at current overlay position                     |
| Docked   | Outside viewport bounds       | **Detach** → OS popup window                                          |
| Floating | Over dock                     | **Insert** at `insertIndex` (dock the panel)                          |
| Floating | Outside dock                  | **Update `floatPosition`**                                            |
| Floating | Outside viewport bounds       | **Detach** → OS popup window                                          |


**Reorder animation (the most delicate one):**

1. Compute the *target natural position* of the dropped panel in the *new* order by summing frozen heights + gaps up to `droppedIdx`.
2. Freeze pointer inputs (`phase = 'drop'`; `pointermove` early-returns).
3. Run a **Web Animation** on the overlay element from its current transform to the target transform (~200ms, same easing). `fill: 'forwards'` holds the final frame.
4. In `anim.onfinish`:
  - **Synchronously** commit the reorder in the store, clear drag state, and set a one-frame `suppressTransitions` flag so the next render doesn't fire sibling transitions from the wrong origin.
  - On the next animation frame, clear `suppressTransitions`.
   The synchronous commit is critical — it must happen in the same paint as removing the overlay, so the user never sees the overlay and the real slot both visible or the siblings animating from stale positions. In React this uses `flushSync`; in any other framework, use whatever primitive forces a synchronous commit + paint coordination.

### 4.3 Floating-over-dock preview

While a floating panel is being dragged and enters the dock zone:

- Render a **drop target fill** (a subtle darkened band) at the prospective insert position with the incoming panel's preview height.
- Displace existing siblings downward by that preview height.
- The panel's own floating preview height may be clamped to the available flex height for realism.

### 4.4 Commit rules (summary)


| Moment                    | Must do                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| Pointer down on header    | Freeze all slot heights; create overlay; placeholder slot `opacity: 0`                           |
| Pointer move              | Update overlay transform + sibling transforms only; no layout writes                             |
| Pointer up (reorder)      | Run overlay → target WAAPI animation; after it finishes, synchronously commit order + clear drag |
| After commit              | Suppress transitions for exactly one render, then restore on next frame                          |
| Pointer up (undock/float) | Write `floatPosition` (or `detach`) in one state update; no overlay animation needed             |
| Pointer up (float→dock)   | Call `insertDockedPanel(id, insertIndex)` in one state update                                    |


### 4.5 Why not a drag library?

Mainstream HTML5 drag-and-drop and most libraries don't cleanly support a *single* element that transitions between four render modes (docked slot / floating overlay / invisible placeholder / popup portal) while continuously animating transforms. Rolling a pointer-event-based controller is ~200 lines and avoids the "jump on drop" classes of bugs that HTML5 DnD and `react-beautiful-dnd` both struggle with here.

---

## 5. Resize

Handled per-panel, not by the dock manager.

- **Bottom edge handle** (docked + floating):
  - `pointerdown` → capture `startY`, `startH`. Set `resizing = true`.
  - `pointermove` → `newH = max(MIN_HEIGHT, startH + dy)`.
    - Docked → `setDockedHeight(id, newH)` (converts the panel from "flex share" to fixed height; siblings redistribute remaining flex).
    - Floating → `setFloatSize(id, { height: newH })`.
  - `pointerup` → reset.
- **Corner handle** (floating only): same, but also writes `width`.
- While resizing any docked panel, set `flexShrink: 0` on all docked slots to prevent the flex layout from squeezing other panels mid-drag.
- `MIN_HEIGHT ≈ 120`, `MIN_WIDTH ≈ 240`.
- Resize drags must `**stopPropagation`** so they don't trigger the header drag handler.

---

## 6. Detach to Native OS Window

A detached panel is rendered into a **secondary browser window** and reactively reparented from the main app via a portal. This preserves all component state across the docked ↔ detached transition.

### 6.1 Opening

1. Store marks panel `detached: true, docked: false, minimized: false`.
2. A `usePopupWindow` effect:
  - Calls `window.open('', 'detached-panel-<id>', 'width=…,height=…,left=…,top=…,resizable=yes')`.
  - If `window.open` returns `null` (blocked), immediately call the close handler (which reattaches) and emit a warning.
  - Sets the popup's `document.title`, resets body margin/padding.
  - **Copies styles from the main document** to the popup's `<head>` (`<style>` and `<link rel="stylesheet">` nodes; relative hrefs are rewritten to absolute). This is what makes the detached panel visually identical.
  - Creates a container `<div id="panel-root">` in the popup's body and exposes it via state.
  - Listens for `beforeunload` on the popup → triggers reattach.
3. A React portal (`createPortal(children, containerEl)`) renders the panel component tree into the popup's container.
4. The detached `DockedPanel` variant hides minimize, detach, add buttons and shows "Return to dock" + close.

### 6.2 Closing / reattaching

- User clicks "Return to dock" → call `reattachPanel(id)`.
- User closes the popup window (OS-level) → `beforeunload` → same reattach path.
- `reattachPanel` clears `detached`, sets `docked: true`, and inserts the panel at the end of the dock.

### 6.3 Gotchas

- Popups must be opened **synchronously from a user gesture** or they are blocked. The "Open in window" click is the gesture.
- Cross-window React contexts: providers from the main tree don't automatically traverse the portal. Anything the detached content needs (theme, viewer adapter, etc.) must either be re-provided on the popup side or be accessible via imperative handles.
- Events fired inside the popup don't bubble to the main window. Explicit messaging (direct function calls via closures is fine; use `postMessage` only if the windows become truly decoupled).

---

## 7. Integration Surfaces

### 7.1 Opening a panel from a toolbar button

```ts
onClick={() => store.togglePanel('properties', 'Properties')}
```

Active state shown on the toolbar button = `store.openPanels.some(p => p.id === 'properties')`.

### 7.2 Panel content registry

Each panel id maps to a `{ Content, Toolbar? }` pair. The dock manager is **content-agnostic** — it only renders the chrome and positions the slot; the registry supplies feature-specific content:

```ts
const PANEL_REGISTRY: Record<PanelId, { Content: ComponentType; Toolbar?: ComponentType }> = {
  views:        { Content: ViewsContent },
  items:        { Content: ItemsContent,      Toolbar: ItemsToolbar },
  properties:   { Content: PropertiesContent, Toolbar: PropertiesToolbar },
  'search-sets':{ Content: SearchSetsContent, Toolbar: SearchSetsToolbar },
  …
};
```

Every Content/Toolbar component talks to the viewer/engine through an **engine-agnostic adapter** interface, never through direct engine imports. This keeps panels portable across viewer implementations.

### 7.3 Minimum API the host app must supply

- A single mount point inside the app viewport where the dock rail + floating panels render (absolute-positioned within a `position: relative` parent).
- A means for any feature to call `store.togglePanel(id, label)` — typically via context / DI / a shared store.
- A list of toolbar buttons bound to panel ids so they can reflect open state.
- Optional: a way to broadcast "viewer tool activated" events if certain panels should open in sync with viewer modes (this repo uses `window.dispatchEvent(new CustomEvent('mv:activate-right-tool', …))`).

---

## 8. Visual Tokens (reference values)


| Token                      | Value                                                      |
| -------------------------- | ---------------------------------------------------------- |
| `TOOLBAR_RIGHT_EDGE`       | 52                                                         |
| `DOCK_GAP`                 | 8                                                          |
| `DOCK_PANEL_WIDTH`         | 320                                                        |
| `EDGE_MARGIN`              | 8                                                          |
| `PANEL_GAP`                | 8                                                          |
| `MINIMIZED_PANEL_HEIGHT`   | 58                                                         |
| `MIN_HEIGHT` / `MIN_WIDTH` | 120 / 240                                                  |
| `SETTLE_MS`                | 200                                                        |
| `EASE`                     | `cubic-bezier(0.22, 1, 0.36, 1)`                           |
| Resting shadow (docked)    | `0 1px 4px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06)`  |
| Floating shadow            | `0 0 20px 0 rgba(0,0,0,0.2)`                               |
| Lifted shadow (dragged)    | `0 0 20px 0 rgba(0,0,0,0.2), 0 12px 32px rgba(0,0,0,0.22)` |


Tune to match target design system; only the animation timing (`SETTLE_MS`, `EASE`) and the "transform-only" transition rule must be preserved.

---

## 9. Test Checklist

These behaviors all existed and were verified in the reference implementation. If the rebuild breaks any of them, the architecture has drifted.

- Open/close a panel via toolbar button; button reflects open state.
- Drag a docked panel up/down: siblings slide; dropped panel lands in the correct slot with one smooth animation and no jump.
- Drag a docked panel out of the rail: becomes floating at release position.
- Drag a docked panel outside the viewport: becomes a native OS window (or shows a fallback if popup is blocked).
- Drag a floating panel over the rail: see insertion preview; release docks it at preview position.
- Drag a floating panel around: position persists after release.
- Minimize a docked panel: collapses to header height; flex siblings expand to fill.
- Minimize a floating panel: collapses to header height in place.
- Resize a docked panel by bottom edge: converts to fixed height; other flex panels redistribute.
- Resize a floating panel by bottom and by corner: width and height update live.
- Detach a panel to a window, then close the window → panel reattaches to the dock automatically.
- Detach a panel, then click "Return to dock" → panel reattaches.
- Panels never lose internal state across dock ↔ float ↔ detach transitions.
- No visible flicker or jump at the moment any drop commits.
- Content reflow inside a panel during a drag never shifts siblings.

---

## 10. Mapping to Reference Files


| Concern                            | File in this repo                                          |
| ---------------------------------- | ---------------------------------------------------------- |
| Store / state model                | `src/chrome/features/dock-manager/useDockStore.ts`         |
| Drag orchestration + rail layout   | `src/chrome/features/dock-manager/DockManager.tsx`         |
| Panel chrome + resize handles      | `src/chrome/features/dock-manager/DockedPanel.tsx`         |
| Detach-to-OS-window portal         | `src/chrome/features/dock-manager/DetachedPanelPortal.tsx` |
| Popup window lifecycle + CSS clone | `src/chrome/features/dock-manager/usePopupWindow.ts`       |
| Panel content registry             | `src/chrome/features/dock-manager/panelContent.tsx`        |
| Toolbar → store binding            | `src/chrome/features/left-toolbar/LeftToolbar.tsx`         |
| Mount point + store owner          | `src/chrome/features/chrome-layout/ChromeLayout.tsx`       |


Use these as **executable reference** while rebuilding. The rules in §4 and the contracts in §2 are the parts that must survive translation into any other architecture.