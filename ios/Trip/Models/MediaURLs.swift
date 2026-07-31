import Foundation

enum MediaURLs {
    /// Resolve a public media path (`/media/...`, absolute URL, or storage key) against the API base.
    static func absoluteURL(_ path: String, baseURL: URL = APIConfig.baseURL) -> URL? {
        let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        if let url = URL(string: trimmed), url.scheme != nil {
            return url
        }

        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            return nil
        }
        components.query = nil
        components.fragment = nil

        if trimmed.hasPrefix("/") {
            components.path = trimmed
            return components.url
        }

        if trimmed.hasPrefix("trips/") {
            components.path = "/media/\(trimmed)"
            return components.url
        }

        components.path = "/media/\(trimmed)"
        return components.url
    }

    static func publicURL(
        tripId: String,
        filename: String,
        baseURL: URL = APIConfig.baseURL
    ) -> URL? {
        if filename.hasPrefix("http")
            || filename.hasPrefix("/")
            || filename.hasPrefix("trips/")
        {
            return absoluteURL(filename, baseURL: baseURL)
        }
        return absoluteURL("/media/trips/\(tripId)/\(filename)", baseURL: baseURL)
    }
}

extension PhotoMeta {
    private static let videoExtensions: Set<String> = [
        "mp4", "webm", "mov", "m4v", "ogg", "ogv",
    ]

    var isVideo: Bool {
        let mime = mimeType.lowercased()
        if mime.hasPrefix("video/") { return true }
        return Self.hasVideoExtension(filename) || Self.hasVideoExtension(originalName)
    }

    var isLivePhoto: Bool {
        guard let liveVideoFilename else { return false }
        return !liveVideoFilename.isEmpty
    }

    func listURL(baseURL: URL = APIConfig.baseURL) -> URL? {
        let name = thumbnailFilename ?? previewFilename ?? filename
        return MediaURLs.publicURL(tripId: tripId, filename: name, baseURL: baseURL)
    }

    func fullURL(baseURL: URL = APIConfig.baseURL) -> URL? {
        let name = previewFilename ?? filename
        return MediaURLs.publicURL(tripId: tripId, filename: name, baseURL: baseURL)
    }

    func posterURL(baseURL: URL = APIConfig.baseURL) -> URL? {
        if let posterFilename {
            return MediaURLs.publicURL(tripId: tripId, filename: posterFilename, baseURL: baseURL)
        }
        return listURL(baseURL: baseURL)
    }

    func liveVideoURL(baseURL: URL = APIConfig.baseURL) -> URL? {
        guard let liveVideoFilename else { return nil }
        return MediaURLs.publicURL(tripId: tripId, filename: liveVideoFilename, baseURL: baseURL)
    }

    private static func hasVideoExtension(_ name: String) -> Bool {
        let ext = (name as NSString).pathExtension.lowercased()
        return videoExtensions.contains(ext)
    }
}

extension Array where Element == PhotoMeta {
    /// Featured first (by featuredAt), then newest upload — mirrors web `sortPhotos`.
    func sortedForGallery() -> [PhotoMeta] {
        sorted { a, b in
            let af = a.featured == true
            let bf = b.featured == true
            if af != bf { return af && !bf }
            if af && bf {
                let at = a.featuredAt.flatMap(Self.parseISO) ?? .distantPast
                let bt = b.featuredAt.flatMap(Self.parseISO) ?? .distantPast
                if at != bt { return at > bt }
            }
            let au = Self.parseISO(a.uploadedAt) ?? .distantPast
            let bu = Self.parseISO(b.uploadedAt) ?? .distantPast
            return au > bu
        }
    }

    private static func parseISO(_ value: String) -> Date? {
        if let date = ISO8601DateFormatter().date(from: value) {
            return date
        }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value)
    }
}
