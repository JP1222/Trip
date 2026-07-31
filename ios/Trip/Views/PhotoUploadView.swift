import PhotosUI
import SwiftUI
import UniformTypeIdentifiers
@preconcurrency import Photos

struct PhotoUploadView: View {
    let tripId: String
    /// Called with successfully uploaded media ids so the gallery can poll until ready.
    var onFinished: ([String]) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var uploader = UploaderIdentity.name
    @State private var caption = ""
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var isUploading = false
    @State private var progressText: String?
    @State private var errorMessage: String?
    @State private var successCount = 0

    private let client = TripAPIClient()

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Your name", text: $uploader)
                        .textContentType(.name)
                    TextField("Caption (optional)", text: $caption, axis: .vertical)
                        .lineLimit(2...4)
                } header: {
                    Text("Credit")
                } footer: {
                    Text("Name is required. It’s saved on this device for next time.")
                }

                Section {
                    let pickerTitle = pickerLabelTitle
                    PhotosPicker(
                        selection: $pickerItems,
                        maxSelectionCount: 30,
                        matching: .any(of: [.images, .videos, .livePhotos])
                    ) {
                        Label(pickerTitle, systemImage: "photo.on.rectangle.angled")
                    }
                }

                if let progressText {
                    Section {
                        Text(progressText)
                            .foregroundStyle(TripTheme.sea)
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(TripTheme.coral)
                    }
                }
            }
            .navigationTitle("Share photos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                        .disabled(isUploading)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Upload") {
                        let items = pickerItems
                        let name = uploader
                        let note = caption
                        Task {
                            await upload(items: items, uploader: name, caption: note)
                        }
                    }
                    .disabled(isUploading || !canUpload)
                }
            }
            .interactiveDismissDisabled(isUploading)
        }
    }

    private var pickerLabelTitle: String {
        pickerItems.isEmpty
            ? "Choose photos or videos"
            : "\(pickerItems.count) selected — tap to change"
    }

    private var canUpload: Bool {
        !uploader.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !pickerItems.isEmpty
    }

    private func upload(
        items: [PhotosPickerItem],
        uploader rawName: String,
        caption rawCaption: String
    ) async {
        let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        UploaderIdentity.name = name

        isUploading = true
        errorMessage = nil
        successCount = 0
        defer { isUploading = false }

        var failures: [String] = []
        var uploadedIds: [String] = []
        let total = items.count
        let captionValue = rawCaption.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty

        for (offset, item) in items.enumerated() {
            progressText = "Uploading \(offset + 1) / \(total)…"
            do {
                let unit = try await MediaPickerLoader.loadUnit(from: item)
                let meta = try await client.uploadPhoto(
                    tripId: tripId,
                    uploader: name,
                    caption: captionValue,
                    unit: unit
                )
                uploadedIds.append(meta.id)
                successCount += 1
            } catch {
                failures.append(error.localizedDescription)
            }
        }

        if !uploadedIds.isEmpty {
            onFinished(uploadedIds)
        }

        if failures.isEmpty {
            progressText = "Uploaded \(successCount) item\(successCount == 1 ? "" : "s")"
            try? await Task.sleep(for: .milliseconds(800))
            dismiss()
        } else if successCount == 0 {
            progressText = nil
            errorMessage = failures.first ?? "Upload failed"
        } else {
            progressText = "Uploaded \(successCount) of \(total)"
            errorMessage = "\(failures.count) failed — \(failures.prefix(2).joined(separator: "; "))"
        }
    }
}

@MainActor
enum MediaPickerLoader {
    static func loadUnit(from item: PhotosPickerItem) async throws -> TripAPIClient.MediaUploadUnit {
        if let live = try await loadLivePair(from: item) {
            return live
        }

        if let movieURL = try await loadMovieURL(from: item) {
            defer { try? FileManager.default.removeItem(at: movieURL) }
            let data = try Data(contentsOf: movieURL)
            let name = movieURL.lastPathComponent
            let mime = mimeType(for: name, fallback: "video/mp4")
            return .init(
                fileData: data,
                filename: name,
                mimeType: mime
            )
        }

        guard let data = try await item.loadTransferable(type: Data.self) else {
            throw TripAPIError.invalidResponse
        }
        let filename = suggestedFilename(for: item, data: data)
        return .init(
            fileData: data,
            filename: filename,
            mimeType: mimeType(for: filename, fallback: "image/jpeg")
        )
    }

    private static func loadLivePair(
        from item: PhotosPickerItem
    ) async throws -> TripAPIClient.MediaUploadUnit? {
        guard let identifier = item.itemIdentifier else { return nil }

        let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        guard status == .authorized || status == .limited else { return nil }

        let assets = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil)
        guard let asset = assets.firstObject,
              asset.mediaSubtypes.contains(.photoLive)
        else { return nil }

        let resources = PHAssetResource.assetResources(for: asset)
        guard let photoResource = resources.first(where: {
            $0.type == .photo || $0.type == .fullSizePhoto
        }),
            let videoResource = resources.first(where: {
                $0.type == .pairedVideo || $0.type == .fullSizePairedVideo
            })
        else { return nil }

        // Sequential (not async let) so PHAssetResource is not sent across tasks.
        let stillName = photoResource.originalFilename.isEmpty
            ? "live.jpg"
            : photoResource.originalFilename
        let liveName = videoResource.originalFilename.isEmpty
            ? "live.mov"
            : videoResource.originalFilename

        let still = try await readResourceData(photoResource)
        let live = try await readResourceData(videoResource)

        return .init(
            fileData: still,
            filename: stillName,
            mimeType: mimeType(for: stillName, fallback: "image/jpeg"),
            liveVideoData: live,
            liveVideoFilename: liveName,
            liveVideoMimeType: mimeType(for: liveName, fallback: "video/quicktime")
        )
    }

    private static func readResourceData(_ resource: PHAssetResource) async throws -> Data {
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(
                (resource.originalFilename as NSString).pathExtension.isEmpty
                    ? "bin"
                    : (resource.originalFilename as NSString).pathExtension
            )

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let options = PHAssetResourceRequestOptions()
            options.isNetworkAccessAllowed = true
            PHAssetResourceManager.default().writeData(
                for: resource,
                toFile: tempURL,
                options: options
            ) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: ())
                }
            }
        }

        defer { try? FileManager.default.removeItem(at: tempURL) }
        return try Data(contentsOf: tempURL)
    }

    private static func loadMovieURL(from item: PhotosPickerItem) async throws -> URL? {
        struct PickedMovie: Transferable {
            let url: URL
            static var transferRepresentation: some TransferRepresentation {
                FileRepresentation(contentType: .movie) { movie in
                    SentTransferredFile(movie.url)
                } importing: { received in
                    let temp = FileManager.default.temporaryDirectory
                        .appendingPathComponent(UUID().uuidString)
                        .appendingPathExtension(received.file.pathExtension)
                    try FileManager.default.copyItem(at: received.file, to: temp)
                    return Self(url: temp)
                }
            }
        }

        if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
            return try await item.loadTransferable(type: PickedMovie.self)?.url
        }
        return nil
    }

    private static func suggestedFilename(for item: PhotosPickerItem, data: Data) -> String {
        if let type = item.supportedContentTypes.first {
            let ext = type.preferredFilenameExtension ?? "jpg"
            return "upload.\(ext)"
        }
        if data.starts(with: [0xFF, 0xD8, 0xFF]) { return "upload.jpg" }
        if data.starts(with: [0x89, 0x50, 0x4E, 0x47]) { return "upload.png" }
        return "upload.bin"
    }

    private static func mimeType(for filename: String, fallback: String) -> String {
        let ext = (filename as NSString).pathExtension.lowercased()
        switch ext {
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "heic": return "image/heic"
        case "heif": return "image/heif"
        case "webp": return "image/webp"
        case "gif": return "image/gif"
        case "mov": return "video/quicktime"
        case "mp4", "m4v": return "video/mp4"
        case "webm": return "video/webm"
        default: return fallback
        }
    }
}

private extension String {
    var nilIfEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
