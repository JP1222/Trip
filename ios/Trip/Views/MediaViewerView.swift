import AVKit
import SwiftUI

struct MediaViewerView: View {
    let photos: [PhotoMeta]
    let startIndex: Int

    @Environment(\.dismiss) private var dismiss
    @State private var index: Int
    @State private var showChrome = true
    @State private var isSaving = false
    @State private var saveMessage: String?

    private let client = TripAPIClient()

    init(photos: [PhotoMeta], startIndex: Int) {
        self.photos = photos
        self.startIndex = startIndex
        _index = State(initialValue: min(max(0, startIndex), max(photos.count - 1, 0)))
    }

    private var current: PhotoMeta? {
        guard photos.indices.contains(index) else { return nil }
        return photos[index]
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            TabView(selection: $index) {
                ForEach(Array(photos.enumerated()), id: \.element.id) { offset, photo in
                    MediaPage(photo: photo)
                        .tag(offset)
                        .onTapGesture {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                showChrome.toggle()
                            }
                        }
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            if showChrome {
                chromeOverlay
            }
        }
        .statusBarHidden(!showChrome)
    }

    private var chromeOverlay: some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(10)
                        .background(.white.opacity(0.15), in: Circle())
                }

                Spacer()

                if let current {
                    Text("\(index + 1) / \(photos.count)")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.white.opacity(0.85))
                    if current.featured == true {
                        Text("★")
                            .foregroundStyle(.yellow)
                    }
                }

                Spacer()

                Button {
                    Task { await saveCurrent() }
                } label: {
                    Group {
                        if isSaving {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: "square.and.arrow.down")
                                .font(.body.weight(.semibold))
                        }
                    }
                    .foregroundStyle(.white)
                    .padding(10)
                    .background(.white.opacity(0.15), in: Circle())
                }
                .disabled(isSaving || current == nil)
                .accessibilityLabel("Save to Photos")
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)

            if let saveMessage {
                Text(saveMessage)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(.black.opacity(0.45), in: Capsule())
                    .padding(.top, 8)
            }

            Spacer()

            if let current {
                VStack(alignment: .leading, spacing: 6) {
                    if let caption = current.caption, !caption.isEmpty {
                        Text(caption)
                            .font(.body)
                            .foregroundStyle(.white)
                    }
                    HStack(spacing: 8) {
                        Text(current.uploader)
                            .font(.subheadline.weight(.medium))
                        if let device = current.device {
                            Text("·")
                            Text(device)
                                .font(.caption)
                        }
                    }
                    .foregroundStyle(.white.opacity(0.8))

                    if let settings = current.cameraSettingsLine {
                        Text(settings)
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.65))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(
                    LinearGradient(
                        colors: [.clear, .black.opacity(0.65)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            }
        }
    }

    private func saveCurrent() async {
        guard let photo = current else { return }
        isSaving = true
        saveMessage = nil
        defer { isSaving = false }

        do {
            let (data, filename) = try await client.downloadPhoto(
                tripId: photo.tripId,
                photoId: photo.id
            )
            let name = filename ?? photo.originalName
            if photo.isVideo || looksLikeVideo(filename: name, mime: photo.mimeType) {
                try await MediaLibrarySaver.saveVideoData(data, filename: name)
            } else {
                try await MediaLibrarySaver.saveImageData(data)
            }

            if photo.isLivePhoto {
                // Also pull the companion motion clip when present.
                if let (liveData, liveName) = try? await client.downloadPhoto(
                    tripId: photo.tripId,
                    photoId: photo.id,
                    part: .live
                ) {
                    try? await MediaLibrarySaver.saveVideoData(
                        liveData,
                        filename: liveName ?? photo.liveVideoOriginalName ?? "live.mov"
                    )
                }
            }

            saveMessage = "Saved to Photos"
            try? await Task.sleep(for: .seconds(1.6))
            saveMessage = nil
        } catch {
            saveMessage = error.localizedDescription
            try? await Task.sleep(for: .seconds(2.2))
            saveMessage = nil
        }
    }

    private func looksLikeVideo(filename: String, mime: String) -> Bool {
        mime.lowercased().hasPrefix("video/")
            || ["mp4", "mov", "m4v", "webm"].contains((filename as NSString).pathExtension.lowercased())
    }
}

private struct MediaPage: View {
    let photo: PhotoMeta
    @State private var player: AVPlayer?

    var body: some View {
        Group {
            if photo.isVideo, let url = photo.fullURL() ?? photo.listURL() {
                VideoPlayer(player: player)
                    .onAppear {
                        if player == nil {
                            player = AVPlayer(url: url)
                        }
                        player?.play()
                    }
                    .onDisappear {
                        player?.pause()
                    }
            } else if photo.isLivePhoto {
                LivePhotoPage(photo: photo)
            } else if let url = photo.fullURL() ?? photo.listURL() {
                ZoomableAsyncImage(url: url)
            } else {
                Image(systemName: "photo")
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
    }
}

private struct LivePhotoPage: View {
    let photo: PhotoMeta
    @State private var playing = false
    @State private var player: AVPlayer?

    var body: some View {
        ZStack {
            if let url = photo.fullURL() ?? photo.listURL() {
                ZoomableAsyncImage(url: url)
                    .opacity(playing ? 0 : 1)
            }
            if playing, let player {
                VideoPlayer(player: player)
                    .disabled(true)
            }
        }
        .overlay(alignment: .topTrailing) {
            Text(playing ? "Playing" : "Hold for Live")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(.black.opacity(0.4), in: Capsule())
                .padding(16)
        }
        .onLongPressGesture(minimumDuration: 0.15, pressing: { pressing in
            if pressing {
                startLive()
            } else {
                stopLive()
            }
        }, perform: {})
    }

    private func startLive() {
        guard let url = photo.liveVideoURL() else { return }
        if player == nil {
            player = AVPlayer(url: url)
        }
        player?.seek(to: .zero)
        player?.play()
        playing = true
    }

    private func stopLive() {
        player?.pause()
        playing = false
    }
}

private struct ZoomableAsyncImage: View {
    let url: URL
    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1

    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let image):
                image
                    .resizable()
                    .scaledToFit()
                    .scaleEffect(scale)
                    .gesture(
                        MagnifyGesture()
                            .onChanged { value in
                                scale = max(1, lastScale * value.magnification)
                            }
                            .onEnded { _ in
                                lastScale = scale
                                if scale < 1.05 {
                                    withAnimation(.easeOut) {
                                        scale = 1
                                        lastScale = 1
                                    }
                                }
                            }
                    )
                    .onTapGesture(count: 2) {
                        withAnimation(.easeInOut) {
                            if scale > 1.2 {
                                scale = 1
                                lastScale = 1
                            } else {
                                scale = 2.2
                                lastScale = 2.2
                            }
                        }
                    }
            case .failure:
                Image(systemName: "exclamationmark.triangle")
                    .foregroundStyle(.white.opacity(0.6))
            case .empty:
                ProgressView()
                    .tint(.white)
            @unknown default:
                EmptyView()
            }
        }
    }
}

extension PhotoMeta {
    var cameraSettingsLine: String? {
        var parts: [String] = []
        if let aperture {
            let formatted: String
            if abs(aperture * 10 - (aperture * 10).rounded()) < 1e-6 {
                formatted = String(format: "%.1f", aperture)
            } else {
                formatted = String(format: "%.1f", aperture)
            }
            parts.append("f/\(formatted)")
        }
        if let shutter { parts.append(shutter) }
        if let iso { parts.append("ISO \(iso)") }
        if let focalLength {
            let fl = abs(focalLength - focalLength.rounded()) < 0.05
                ? String(Int(focalLength.rounded()))
                : String(format: "%.1f", focalLength)
            if let focalLength35, abs(focalLength35 - focalLength) > 0.5 {
                parts.append("\(fl)mm · \(Int(focalLength35.rounded()))mm eq.")
            } else {
                parts.append("\(fl)mm")
            }
        } else if let focalLength35 {
            parts.append("\(Int(focalLength35.rounded()))mm eq.")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}
