import Foundation

/// Errors produced by `TripAPIClient`.
enum TripAPIError: Error, LocalizedError, Sendable {
    case invalidURL(String)
    case invalidResponse
    case httpStatus(code: Int, message: String?)
    case decoding(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL(let path):
            return "Invalid URL for path: \(path)"
        case .invalidResponse:
            return "Invalid server response"
        case .httpStatus(let code, let message):
            if let message, !message.isEmpty {
                return "HTTP \(code): \(message)"
            }
            return "HTTP \(code)"
        case .decoding(let error):
            return "Decoding failed: \(error.localizedDescription)"
        }
    }
}

/// Scope for `GET /api/trips/:id/comments`.
enum CommentListScope: Sendable {
    /// Trip-level notes only (`?scope=trip`).
    case trip
    /// All comments (omit scope / photoId).
    case all
    /// Comments for a single photo (`?photoId=`).
    case photo(String)

    fileprivate var queryItems: [URLQueryItem] {
        switch self {
        case .trip:
            return [URLQueryItem(name: "scope", value: "trip")]
        case .all:
            return []
        case .photo(let photoId):
            return [URLQueryItem(name: "photoId", value: photoId)]
        }
    }
}

/// URLSession client for the Trip web API.
///
/// Phase 0: read-only GETs. Mutating requests will send an `Origin` header
/// matching the configured base URL (CORS / origin checks on the backend).
actor TripAPIClient {
    let baseURL: URL
    let session: URLSession
    let decoder: JSONDecoder

    init(
        baseURL: URL = APIConfig.baseURL,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.session = session
        self.decoder = JSONDecoder()
    }

    // MARK: - Endpoints

    /// `GET /api/health/live`
    func healthLive() async throws -> HealthLiveResponse {
        try await get(path: "/api/health/live")
    }

    /// `GET /api/trips`
    func trips() async throws -> [Trip] {
        try await get(path: "/api/trips")
    }

    /// `GET /api/wall` — home cork board (note + board photos + trips).
    func wall() async throws -> [WallItem] {
        let response: WallResponse = try await get(path: "/api/wall")
        return response.items
    }

    /// `GET /api/trips/:id`
    func trip(id: String) async throws -> Trip {
        try await get(path: "/api/trips/\(id)")
    }

    /// `GET /api/trips/:id/photos`
    func photos(tripId: String) async throws -> [PhotoMeta] {
        try await get(path: "/api/trips/\(tripId)/photos")
    }

    /// `GET /api/trips/:id/comments?scope=trip` (default scope)
    func comments(
        tripId: String,
        scope: CommentListScope = .trip
    ) async throws -> [Comment] {
        try await get(
            path: "/api/trips/\(tripId)/comments",
            queryItems: scope.queryItems
        )
    }

    // MARK: - Internals

    func get<T: Decodable>(
        path: String,
        queryItems: [URLQueryItem] = []
    ) async throws -> T {
        let request = try makeRequest(
            method: "GET",
            path: path,
            queryItems: queryItems
        )
        return try await perform(request)
    }

    /// Builds a request. Mutating methods attach `Origin` matching `baseURL`.
    func makeRequest(
        method: String,
        path: String,
        queryItems: [URLQueryItem] = []
    ) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw TripAPIError.invalidURL(path)
        }

        let trimmedPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let basePath = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let joined = [basePath, trimmedPath].filter { !$0.isEmpty }.joined(separator: "/")
        components.path = "/" + joined

        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }

        guard let url = components.url else {
            throw TripAPIError.invalidURL(path)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        // Backend origin checks on POST/PUT/PATCH/DELETE.
        if method != "GET" && method != "HEAD" {
            request.setValue(originHeaderValue, forHTTPHeaderField: "Origin")
        }

        return request
    }

    /// Origin value matching the configured API base URL (scheme + host[:port]).
    var originHeaderValue: String {
        var components = URLComponents()
        components.scheme = baseURL.scheme
        components.host = baseURL.host
        components.port = baseURL.port
        return components.string ?? baseURL.absoluteString
    }

    func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw error
        }

        guard let http = response as? HTTPURLResponse else {
            throw TripAPIError.invalidResponse
        }

        guard (200..<300).contains(http.statusCode) else {
            let message = (try? decoder.decode(APIErrorBody.self, from: data))?.error
            throw TripAPIError.httpStatus(code: http.statusCode, message: message)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw TripAPIError.decoding(error)
        }
    }
}
