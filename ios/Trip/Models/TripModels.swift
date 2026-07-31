import Foundation

// MARK: - Enums (mirror src/lib/types.ts)

/// food | stay | sight | activity | transport | shop | other
enum StopCategory: String, Codable, Sendable, Hashable {
    case food
    case stay
    case sight
    case activity
    case transport
    case shop
    case other
}

/// lived = memories; planned = upcoming trip
enum TripStatus: String, Codable, Sendable, Hashable {
    case lived
    case planned
}

/// Durable media processing state.
enum PhotoProcessingState: String, Codable, Sendable, Hashable {
    case pending
    case processing
    case ready
    case failed
}

// MARK: - Itinerary

struct ItineraryItem: Codable, Sendable, Identifiable, Hashable {
    var id: String
    var time: String?
    var title: String
    var description: String?
    /// Place name (shown under the title)
    var location: String?
    /// Kind of stop — food, stay, sight, …
    var category: StopCategory?
    /// Optional coords — when set, this stop appears on the map
    var lat: Double?
    var lng: Double?
}

struct DayPlan: Codable, Sendable, Hashable {
    var day: Int
    var date: String
    var title: String
    var items: [ItineraryItem]
}

// MARK: - Map

/// One stop on the trip map (ordered = travel path)
struct TripWaypoint: Codable, Sendable, Hashable {
    var lat: Double
    var lng: Double
    /// Name shown on the pin / list
    var label: String
    /// Optional day number for “Day 2 · …”
    var day: Int?
    /// Stable id for selection sync (usually itinerary item id)
    var id: String?
    /// @deprecated prefer id
    var itemId: String?
    /// For colored / icon pins on the map
    var category: StopCategory?
}

/// Map shown beside the travel plan — center + optional multi-stop route
struct TripLocation: Codable, Sendable, Hashable {
    var lat: Double
    var lng: Double
    /// Used when there is only one stop
    var zoom: Double?
    /// Short title under the map
    var label: String?
    /// Specific places in visit order.
    var stops: [TripWaypoint]?
}

// MARK: - Budget

/// Expense line for the trip budget
struct BudgetItem: Codable, Sendable, Identifiable, Hashable {
    var id: String
    var label: String
    var amount: Double
    /// stay | food | transport | activity | other
    var category: String?
    var paidBy: String?
}

struct TripBudget: Codable, Sendable, Hashable {
    /// ISO-ish code, e.g. USD
    var currency: String
    /// Optional spending cap
    var limit: Double?
    var items: [BudgetItem]
}

// MARK: - Showcase

struct ShowcaseImage: Codable, Sendable, Hashable {
    var src: String
    var caption: String
}

// MARK: - Trip

struct Trip: Codable, Sendable, Identifiable, Hashable {
    var id: String
    var title: String
    var subtitle: String
    var destination: String
    var startDate: String
    var endDate: String
    /// Omit or "lived" = past trip with photos; "planned" = upcoming.
    var status: TripStatus?
    var coverGradient: String
    var coverEmoji: String
    /// Optional cover photo URL for the wall
    var coverImage: String?
    /// Extra showcase images until friends upload real shots
    var showcase: [ShowcaseImage]?
    /// Optional map (single pin or multi-stop route)
    var location: TripLocation?
    var summary: String
    var members: [String]
    var days: [DayPlan]
    /// Planning checklist / tips
    var tips: [String]?
    /// Shared group budget
    var budget: TripBudget?
}

// MARK: - Gallery media

/// Gallery media item (photo, video, or Apple Live Photo).
struct PhotoMeta: Codable, Sendable, Identifiable, Hashable {
    var id: String
    var tripId: String
    /// Durable processing state. Gallery reads normally include ready media only.
    var state: PhotoProcessingState?
    var filename: String
    /// High-res list derivative (grid ~1080).
    var thumbnailFilename: String?
    /// Full-resolution public still for lightbox.
    var previewFilename: String?
    /// Video poster derivative.
    var posterFilename: String?
    var originalName: String
    var uploader: String
    var caption: String?
    /// Camera / phone model from EXIF (or inferred)
    var device: String?
    /// f-number, e.g. 2.8
    var aperture: Double?
    /// Display shutter speed, e.g. "1/125" or "2s"
    var shutter: String?
    /// ISO sensitivity
    var iso: Int?
    /// Focal length in mm (actual)
    var focalLength: Double?
    /// 35mm-equivalent focal length
    var focalLength35: Double?
    /// Lens model string when present
    var lens: String?
    /// Capture time from EXIF DateTimeOriginal
    var takenAt: String?
    /// image/* or video/*
    var mimeType: String
    var size: Int
    /// Pixel size of the primary public still / video (orientation-corrected).
    var width: Int?
    var height: Int?
    var uploadedAt: String
    /// Admin-starred pick
    var featured: Bool?
    /// ISO time when starred
    var featuredAt: String?
    /// Apple Live Photo companion video
    var liveVideoFilename: String?
    var liveVideoOriginalName: String?
    var liveVideoSize: Int?
    var liveVideoMimeType: String?
    /// Sanitized worker error for an uploader/admin
    var processingError: String?
}

// MARK: - Comments

struct Comment: Codable, Sendable, Identifiable, Hashable {
    var id: String
    var tripId: String
    /// When set, comment is on a single photo; when omitted, trip-level note
    var photoId: String?
    var author: String
    var body: String
    var createdAt: String
}

// MARK: - Health

struct HealthLiveResponse: Codable, Sendable, Hashable {
    var status: String
    var service: String
    var uptimeSeconds: Int
}

// MARK: - Errors payload

struct APIErrorBody: Codable, Sendable, Hashable {
    var error: String
}
