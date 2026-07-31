# Trip (iOS) — Phase 2

Native SwiftUI friend app for [trip.jpzen.cn](https://trip.jpzen.cn).

**Phase 0:** models, API client, home list  
**Phase 1:** trip detail, itinerary + MapKit, gallery viewer  
**Phase 2 (current):** upload, post notes, save to Photos

## Requirements

- **Xcode 26+** · deployment target **iOS 26.0**
- Optional: `brew install xcodegen`

```bash
cd ios && xcodegen generate && open Trip.xcodeproj
```

## Write APIs used

| Action | Endpoint |
| --- | --- |
| Upload (one unit/request) | `POST /api/trips/:id/photos` multipart `file` (+ optional `liveVideo`), `uploader`, `caption` |
| Post note | `POST /api/trips/:id/comments` JSON `{ author, body }` |
| Privacy download | `GET /api/trips/:id/photos/:photoId/download` (+ `?part=live`) |

Mutating requests send `Origin` matching `TRIP_API_BASE_URL`.

## Privacy strings

- `NSPhotoLibraryUsageDescription` — Live Photo / video upload
- `NSPhotoLibraryAddUsageDescription` — save downloads

## Out of scope (later)

Cork wall, budget, collab plan editing, admin.
