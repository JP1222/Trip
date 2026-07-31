import Foundation

/// API base URL for the Trip backend.
///
/// Resolved from `Info.plist` key `TRIP_API_BASE_URL` (set via xcconfig).
/// Defaults to production when the key is missing.
enum APIConfig {
    static let productionBaseURL = URL(string: "https://trip.jpzen.cn")!

    /// Effective base URL used by `TripAPIClient`.
    static var baseURL: URL {
        if let override = ProcessInfo.processInfo.environment["TRIP_API_BASE_URL"],
           let url = URL(string: override),
           url.scheme != nil
        {
            return url
        }

        if let raw = Bundle.main.object(forInfoDictionaryKey: "TRIP_API_BASE_URL") as? String,
           let url = URL(string: raw),
           url.scheme != nil
        {
            return url
        }

        return productionBaseURL
    }
}
