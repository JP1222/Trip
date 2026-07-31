import Foundation

extension TripAPIClient {
    /// One upload unit: still/video, or Live Photo still + companion video.
    struct MediaUploadUnit: Sendable {
        var fileData: Data
        var filename: String
        var mimeType: String
        var liveVideoData: Data?
        var liveVideoFilename: String?
        var liveVideoMimeType: String?
    }

    /// `POST /api/trips/:id/photos` — one unit per request.
    func uploadPhoto(
        tripId: String,
        uploader: String,
        caption: String?,
        unit: MediaUploadUnit
    ) async throws -> PhotoMeta {
        var form = MultipartFormData()
        form.appendFile(
            name: "file",
            filename: unit.filename,
            mimeType: unit.mimeType,
            data: unit.fileData
        )
        if let liveData = unit.liveVideoData,
           let liveName = unit.liveVideoFilename
        {
            form.appendFile(
                name: "liveVideo",
                filename: liveName,
                mimeType: unit.liveVideoMimeType ?? "video/quicktime",
                data: liveData
            )
        }
        form.appendField(name: "uploader", value: uploader)
        if let caption, !caption.isEmpty {
            form.appendField(name: "caption", value: caption)
        }
        form.finish()

        var request = try makeRequest(method: "POST", path: "/api/trips/\(tripId)/photos")
        request.setValue(form.contentType, forHTTPHeaderField: "Content-Type")
        request.httpBody = form.body
        request.timeoutInterval = 120
        return try await perform(request)
    }

    /// `POST /api/trips/:id/comments`
    func postComment(
        tripId: String,
        author: String,
        body: String,
        photoId: String? = nil
    ) async throws -> Comment {
        struct Payload: Encodable {
            var author: String
            var body: String
            var photoId: String?
        }

        var request = try makeRequest(method: "POST", path: "/api/trips/\(tripId)/comments")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(
            Payload(author: author, body: body, photoId: photoId)
        )
        return try await perform(request)
    }

    /// Privacy download — images EXIF-stripped. `part=live` for Live companion.
    func downloadPhoto(
        tripId: String,
        photoId: String,
        part: DownloadPart = .primary
    ) async throws -> (Data, String?) {
        var query: [URLQueryItem] = []
        if part == .live {
            query = [URLQueryItem(name: "part", value: "live")]
        }
        let request = try makeRequest(
            method: "GET",
            path: "/api/trips/\(tripId)/photos/\(photoId)/download",
            queryItems: query
        )
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw TripAPIError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? decoder.decode(APIErrorBody.self, from: data))?.error
            throw TripAPIError.httpStatus(code: http.statusCode, message: message)
        }
        let filename = Self.filename(from: http)
        return (data, filename)
    }

    enum DownloadPart: Sendable {
        case primary
        case live
    }

    private static func filename(from response: HTTPURLResponse) -> String? {
        guard let header = response.value(forHTTPHeaderField: "Content-Disposition")
        else { return nil }

        if let star = header.range(of: "filename*=UTF-8''", options: .caseInsensitive) {
            let rest = header[star.upperBound...]
            let token = rest.split(separator: ";").first.map(String.init) ?? String(rest)
            return token.trimmingCharacters(in: .whitespacesAndNewlines).removingPercentEncoding
        }

        guard let key = header.range(of: "filename=", options: .caseInsensitive) else {
            return nil
        }
        var value = String(header[key.upperBound...])
            .split(separator: ";")
            .first
            .map(String.init) ?? ""
        value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("\"") && value.hasSuffix("\"") && value.count >= 2 {
            value.removeFirst()
            value.removeLast()
        }
        return value.isEmpty ? nil : value
    }
}
