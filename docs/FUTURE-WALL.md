# Future: Custom wall & collab

> Captured 2026-07-28 from product chat. Do **not** build yet unless asked — wrap-up / ship first. This is the long-term vision for the polaroid wall.

## Vision

The home wall should feel like **my board** — not a fixed layout. Users decorate it freely, make it “their look,” then **send it to friends**. Friends can join the same board with **scoped edit rights**.

## High customizability

### Board surface
- Stronger “cork / board” metaphor as a canvas, not only a static gallery.
- Background / board texture optional later (cork, fridge door, metal, custom image).

### Decor stickers (fridge-magnet style)
Users can drop non-photo items onto the board:
- **Sticky notes** (便签) — text, color, drag position
- **Fridge magnets** — upload custom magnet graphics
- **License plates** / other trinkets — upload or pick from a small sticker set
- Pins, washi tape, string, etc. as optional chrome

All decor: **drag position**, maybe rotate/scale, z-order (bring front / send back).

### Polaroids as free objects
Each photo frame is a free-transform object on the board:
- **Size** — resize polaroid
- **Angle** — free rotate
- **Position** — drag anywhere on the board
- Optional: frame style, caption on the white margin, pin color

Not limited to a rigid masonry/polaroid grid — layout is **what the user arranges**.

### Share the vibe
- Export / share a link to **this board look** (not only a trip page)
- “Send to friends” as a finished personal wall, or as a live collab space

## Collaboration & permissions

- **Invite friends** into *my* wall (or a shared board room).
- Owner sets what each friend can do, e.g.:
  - view only
  - add / move their own polaroids
  - edit decor (notes, magnets)
  - rearrange anything
  - delete / manage invites
- Complements existing **trip collab** (`?edit=` plan/budget token) — wall collab is a separate, richer permission model.

## Relationship to current product

| Now | Later |
|-----|--------|
| Fixed wall layout from trips/photos | Free-canvas wall objects |
| Trip-level collab for plan + budget | Board-level invites + role permissions |
| Logo polaroid mark (A) as brand | Same metaphor as the interactive board |
| Admin manages trips/photos | Users co-create the shared surface |

## Suggested build phases (when we return)

1. **Free-transform polaroids** on one trip or home wall (position / rotate / size, persist JSON).
2. **Sticky notes** as first decor type.
3. **Upload stickers** (magnet / plate) as image layers.
4. **Share board link** + simple roles (view / edit).
5. **Fine-grained permissions** + multi-user presence (optional realtime).

## Out of scope for now

- Don’t block shipping Docker / production wrap-up.
- Don’t expand admin or trip planner for this until the wall canvas MVP is intentional.

## Related files today

- `src/components/PolaroidWall.tsx` / `AdminPolaroidWall.tsx`
- `src/lib/wall.ts`
- Brand mark: `public/branding/logo.png` (polaroid icon)
- Trip collab (different surface): `collabToken`, `CollabShareCard`, plan API
