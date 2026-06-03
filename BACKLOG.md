# Backlog

Future work items that have been discussed but not yet implemented.

**At the end of every session, do two things:**

1. **Cross things off.** If anything in this file got built during the
   session, remove the entry. The code change is the record. Stale "done"
   entries make this file harder to use.
2. **Add things on.** If a discussion turned up a real problem or
   improvement that wasn't in scope, write a backlog entry before
   wrapping up. Each entry should explain the *why* and at least one
   viable approach — future-you (or a colleague) shouldn't have to
   re-investigate the problem from scratch.

Don't put session-scoped work here — that belongs in the agent's task
list. This file is for things that survive across sessions.

See [`CLAUDE.md` §9](./CLAUDE.md) for the full workflow, and §1 for the
documentation sweep that runs alongside it on every commit.

---

## Apply hidden-objects state during streaming load

**Why:** When a model loads with a saved home view that hides some objects,
the hidden objects are briefly visible while meshes stream in, then snap to
hidden when `load-complete` fires. Visually noticeable on slow loads.

Sectioning already handles this correctly — clip planes are renderer-global
and applied at seed time, so streaming meshes appear pre-clipped. Visibility
can't use the same trick because the `getMeshByElementId(id)` lookup map is
empty until meshes are loaded; calling `hide(['element-123'])` against a
not-yet-loaded model is a silent no-op.

### Options

1. **Queue and apply per-batch (recommended).** Pre-load the hide list as a
   "pending" set on `Visibility`. On each `object-load-progress` or reveal
   batch (whatever event the loader fires per chunk), run `hide()` against
   the IDs that just became resolvable. Objects appear already-hidden as
   they stream. Estimated: 20–40 lines in `Visibility.js` plus a hook in
   the loader's reveal callback.

2. **Accept the brief flash.** Apply visibility at `load-complete` (current
   behavior). Objects appear, then immediately hide. Worse UX but zero
   code change.

Option 1 is the right answer for parity with sectioning. Option 2 is the
status quo if nobody complains.

### Touchpoints

- `src/features/Visibility.js` — add a `setPendingHidden(ids)` API and an
  internal "apply when resolvable" hook.
- `src/core/IFCLoader.js` or wherever reveal batches fire — call into the
  Visibility pending-apply hook per batch.
- `src/chrome/app/ChromeApp.tsx` — in the viewer-ready handler, after the
  camera/sectioning seed, call `viewer.visibility.setPendingHidden(home.hiddenObjects)`
  instead of waiting for `load-complete`.
