import Photos
import UIKit

enum MediaLibrarySaver {
    enum SaveError: LocalizedError {
        case notAuthorized
        case unsupported
        case writeFailed(String)

        var errorDescription: String? {
            switch self {
            case .notAuthorized:
                return "Photo library access was denied"
            case .unsupported:
                return "Can’t save this media type"
            case .writeFailed(let message):
                return message
            }
        }
    }

    static func saveImageData(_ data: Data) async throws {
        try await ensureAddAccess()
        guard let image = UIImage(data: data) else {
            throw SaveError.unsupported
        }
        try await performChanges {
            PHAssetChangeRequest.creationRequestForAsset(from: image)
        }
    }

    static func saveVideoData(_ data: Data, filename: String) async throws {
        try await ensureAddAccess()
        let ext = (filename as NSString).pathExtension.isEmpty
            ? "mp4"
            : (filename as NSString).pathExtension
        let temp = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(ext)
        try data.write(to: temp)
        defer { try? FileManager.default.removeItem(at: temp) }
        try await performChanges {
            PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: temp)
        }
    }

    private static func ensureAddAccess() async throws {
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else {
            throw SaveError.notAuthorized
        }
    }

    private static func performChanges(_ changes: @escaping () -> Void) async throws {
        do {
            try await PHPhotoLibrary.shared().performChanges(changes)
        } catch {
            throw SaveError.writeFailed(error.localizedDescription)
        }
    }
}
