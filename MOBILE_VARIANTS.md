# MOBILE_VARIANTS.md

Status and next steps for the tablet / phone form-factor work. Architectural rules live in [CLAUDE.md §3a–3d](./CLAUDE.md); this document tracks **what's built, what's left, and the decisions still open**.

---

## Current Status (2026-06-03)

**Shared mobile chrome is now live for tablet + phone.** Desktop remains unchanged, but tablet/phone no longer forward to desktop chrome. Both form factors render a dedicated mobile shell (`ChromeLayoutMobile`) inside the device frame, with a transparent mobile header, mobile bottom toolbar, joystick visual overlay, and single-panel mobile panel behavior.

### What's built

- `src/chrome/features/form-factor/` — `FormFactorContext` with form factor (`desktop` / `tablet` / `phone`) and orientation (`portrait` / `landscape`). URL-driven via `?form=` and `?orient=`. Bare URL defaults to desktop. Orientation defaults: tablet → landscape, phone → portrait. Switching form factors resets orientation to the new default.
- Header phone-icon button opens the form-factor menu (`src/chrome/features/form-factor-menu/`); cog opens the Settings window.
- `src/chrome/features/chrome-layout/DeviceFrame.tsx` — centered, bezelled device shell. Scale-independent bezel, concentric corner radii, notch + home indicator for phone, rotation button outside top-right, and a device-preview (form-factor) button stacked beneath rotate for tablet/phone.
- `src/chrome/features/chrome-layout/ChromeLayoutMobile.tsx` — shared tablet/phone layout with full-bleed viewer canvas, transparent overlaid mobile header, overlaid mobile bottom toolbar, overlaid joystick visuals, and mobile single-panel rendering.
- `src/chrome/features/header/` — variant files (`Header.desktop.tsx`, `Header.tablet.tsx`, `Header.phone.tsx`) + `index.tsx` selector + `types.ts`. Tablet/phone now point to `mobile-header/MobileHeader.tsx`; desktop keeps desktop header behavior.
- `src/chrome/features/mobile-header/` — mobile header with close, model label, settings, search, and overflow actions. Header background is white at 20% opacity so model content remains visible behind it.
- `src/chrome/features/mobile-bottom-bar/` — mobile toolbar system with reusable 64x64 button primitives, 72px toolbar containers, General/Tools mode switch, mobile panel open events, tool/detail rows (including sectioning detail modes), and reset/undo/redo actions.
- `src/chrome/features/joystick-overlay/` — tablet/phone joystick visual stubs positioned above reset/undo/redo (visual only; no touch navigation wiring yet).
- Viewer container survives variant switches: `ChromeApp` uses a callback ref backed by state, and the `useEffect` migrates `viewer.canvasContainer` to the new container on variant remount (see CLAUDE.md §3c).
- Model picker `href` preserves `?form=` and `?orient=` via `URLSearchParams` (see CLAUDE.md §3d).

### Known caveats

- **WelcomeOverlay (historical, pre-chrome):** An earlier pre-chrome prototype had a "WelcomeOverlay" with an Upload button; both were removed before the React chrome layer was built. There is no upload flow in the current app. Models are added by dropping `.ifc` files into `public/models/`, running `npm run convert`, and registering them in the `MODELS` array in [`ChromeApp.tsx`](src/chrome/app/ChromeApp.tsx).
- **Touch input is not wired.** Pinch zoom and tap-hold-drag rely on whatever the browser's default Pointer Events handling produces — fine for a prototype demo on a laptop, not tuned for real devices yet.
- **No active form-factor-specific tests** exist. Existing Playwright tests use `demo/old.html`, which doesn't load the chrome at all.

---

## Next Steps

The work below uses the variant file pattern from CLAUDE.md §3a. Each item is independent — pick whichever order fits the available Figma.

### 1. Refine mobile header variants (`src/chrome/features/mobile-header/`)

Tablet and phone now share `MobileHeader`. Next step is splitting into true tablet/phone variants only when real design divergence exists (keep shared hook/state if split).

### 2. Real toolbar variants

`src/chrome/features/left-toolbar/` and `src/chrome/features/right-toolbar/` need variant files. Tablet may keep the desktop edge-anchored placement; phone likely consolidates both toolbars into a single bottom bar or floating actions overlay. Treat each toolbar as its own feature dir following the same pattern as `header/`.

### 3. `movement-joystick` (new feature, phone-only)

```
src/chrome/features/movement-joystick/
├── index.tsx                  ← returns null on desktop/tablet
├── MovementJoystick.phone.tsx ← visual joystick(s) at corners
└── useMovementJoystick.ts     ← state for knob position (no adapter calls yet)
```

- **Visual only at first.** The hook tracks joystick state but does not call the adapter. Users can still navigate via the existing pointer-events-based touch on the canvas.
- Default + look-around is the only nav mode shown on tablet/phone (per the architecture conversation). The mode picker UI doesn't render in those form factors — the engine stays in `look` mode the whole time.
- When the prototype graduates to real device testing, wire the joystick to a new continuous-movement method on the adapter (additive change to `viewer-adapter/types.ts` only).

### 4. Panel system variants

Mobile currently uses a single in-app panel (one panel visible at a time; opening another replaces it). Next step is to evolve that shell toward a true mobile drawer/tab experience while still reusing existing panel content components.

### 5. Welcome / loading overlay framing

If a welcome or loading screen returns later, it currently uses `position: absolute inset-0` which would render *outside* the device frame on tablet/phone. Solution when the time comes: render any full-screen overlay inside the chrome layout, not at the ChromeApp level — so it lives within the device frame. Flag, not blocker.

### 6. Touch gesture handling (when real device testing starts)

The current Pointer Events in [`Navigation.js`](src/features/Navigation.js) partially work on touch but are not tuned. When real device testing begins:

- Replace right-click temporary mode switching (CLAUDE.md §4c) with a touch alternative: long-press, two-finger drag, or a UI button.
- Replace scroll-wheel zoom with pinch zoom. Reuse the existing scroll math, including the `MIN_STEP = 0.5` floor.
- Audit chrome features that rely on `:hover` (toolbar tooltips, header popovers) and convert to tap-based interactions on phone/tablet.
- Put new gesture logic in a `useTouchGestures()` hook inside `viewer-canvas/`, calling the adapter — not in `Navigation.js`. The engine should not learn about form factor.

### 7. Tests

When variants gain real divergent content, add `evals/tests/tablet/` and `evals/tests/phone/` spec dirs. Each test navigates to `?form=tablet` (or phone) directly — no need to click the cog unless the cog itself is under test. Don't share assertions across form factors; each spec gets its own.

---

## Open Decisions

These didn't block the scaffolding work but will come up when implementing variant designs:

1. **Phone dropdowns** — when does the codebase adopt iOS/Android-style bottom drawers for pickers? Probably when one of the consumer surfaces actually needs the touch ergonomics. Until then, dropdowns are reused as-is.
2. **Joystick wiring timing** — does the adapter gain a continuous-movement method now (so it's ready), or only when joysticks are tested on real devices?
3. **Device dimension targets** — current frame sizes (`SCREEN_DIMENSIONS` in [`DeviceFrame.tsx`](src/chrome/features/chrome-layout/DeviceFrame.tsx)) match iPhone 15 (393×852) and iPad Pro 11" (1194×834). If the Figma targets specific other devices, update the map.
4. **Form-factor coverage for engine features** — the engine currently doesn't know form factor and should stay that way. If a future feature genuinely needs to behave differently per form factor (e.g. measurement tool gestures), the form factor flows in via the adapter from chrome — never as an import from the form-factor context into engine code.
