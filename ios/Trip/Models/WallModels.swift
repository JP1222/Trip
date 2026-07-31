import Foundation

enum WallItemKind: String, Codable, Sendable, Hashable {
    case trip
    case photo
    case empty
    case note
}

enum WallPhotoOrientation: String, Codable, Sendable, Hashable {
    case landscape
    case portrait
    case square
}

enum WallFrameStyle: String, Codable, Sendable, Hashable {
    case polaroid
    case borderless
    case thin_white
}

enum WallDisplaySize: String, Codable, Sendable, Hashable {
    case sm
    case md
    case lg
}

/// Mirrors web `WallItem` from `src/lib/wall.ts`.
struct WallItem: Codable, Sendable, Identifiable, Hashable {
    var kind: WallItemKind
    var id: String
    var href: String?
    var src: String?
    var orientation: WallPhotoOrientation?
    var caption: String
    var sub: String?
    var meta: String?
    var dateLabel: String?
    var planned: Bool?
    var coverGradient: String?
    var coverEmoji: String?
    var noteLines: [String]?
    var noteSignature: String?
    var frameStyle: WallFrameStyle?
    var displaySize: WallDisplaySize?
    var hideLabels: Bool?

    var tripId: String? {
        guard kind == .trip, let href else { return nil }
        let parts = href.split(separator: "/").map(String.init)
        guard let idx = parts.firstIndex(of: "trips"), parts.indices.contains(idx + 1) else {
            return nil
        }
        return parts[idx + 1]
    }

    var isPlanned: Bool { planned == true }

    var footerMeta: String {
        meta ?? dateLabel ?? ""
    }

    var printScale: Double {
        switch displaySize ?? .md {
        case .sm: 0.78
        case .md: 1.0
        case .lg: 1.15
        }
    }
}

struct WallResponse: Codable, Sendable {
    var items: [WallItem]
}
