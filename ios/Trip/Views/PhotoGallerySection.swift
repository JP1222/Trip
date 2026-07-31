import AVKit
import SwiftUI

struct PhotoGallerySection: View {
    let tripId: String
    let photos: [PhotoMeta]
    let isLoading: Bool
    var isProcessingUploads: Bool = false
    let errorMessage: String?
    var onUploadFinished: ([String]) -> Void

    @State private var viewerIndex: Int?
    @State private var livePlayingId: String?
    @State private var showUpload = false

    private var sorted: [PhotoMeta] { photos.sortedForGallery() }

    private let columns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Photos")
                        .font(TripTheme.serif(28, weight: .regular))
                        .foregroundStyle(TripTheme.ink)
                    Text("Open a shot to preview · comment & download.")
                        .font(.system(size: 14))
                        .foregroundStyle(TripTheme.inkMuted)
                }
                Spacer()
                Button {
                    showUpload = true
                } label: {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.borderedProminent)
                .tint(TripTheme.ink)
                .disabled(isProcessingUploads)
            }

            if isProcessingUploads {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Processing uploads…")
                        .font(.subheadline)
                        .foregroundStyle(TripTheme.sea)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(TripTheme.sea.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }

            Group {
                if isLoading && photos.isEmpty {
                    ProgressView("Loading photos…")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 40)
                } else if let errorMessage, photos.isEmpty {
                    Text(errorMessage)
                        .font(.subheadline)
                        .foregroundStyle(TripTheme.inkMuted)
                        .padding(.vertical, 24)
                } else if sorted.isEmpty {
                    ContentUnavailableView(
                        "No photos yet",
                        systemImage: "photo.on.rectangle.angled",
                        description: Text(
                            isProcessingUploads
                                ? "Finishing processing — photos will appear shortly."
                                : "Share the first shot from this trip."
                        )
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                } else {
                    LazyVGrid(columns: columns, spacing: 8) {
                        ForEach(Array(sorted.enumerated()), id: \.element.id) { index, photo in
                            PhotoGridCell(
                                photo: photo,
                                isLivePlaying: livePlayingId == photo.id
                            ) {
                                viewerIndex = index
                            } onLivePressChanged: { pressing in
                                livePlayingId = pressing ? photo.id : nil
                            }
                        }
                    }
                }
            }
        }
        .fullScreenCover(item: viewerBinding) { item in
            MediaViewerView(
                photos: sorted,
                startIndex: item.index
            )
        }
        .sheet(isPresented: $showUpload) {
            PhotoUploadView(tripId: tripId) { uploadedIds in
                onUploadFinished(uploadedIds)
            }
        }
    }

    private var viewerBinding: Binding<ViewerLaunch?> {
        Binding(
            get: {
                guard let viewerIndex else { return nil }
                return ViewerLaunch(index: viewerIndex)
            },
            set: { newValue in
                viewerIndex = newValue?.index
            }
        )
    }
}

private struct ViewerLaunch: Identifiable {
    let index: Int
    var id: Int { index }
}

private struct PhotoGridCell: View {
    let photo: PhotoMeta
    let isLivePlaying: Bool
    let onTap: () -> Void
    let onLivePressChanged: (Bool) -> Void

    var body: some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                thumbnail
            }
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(alignment: .topLeading) {
                if photo.featured == true {
                    Text("★")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(6)
                        .background(.black.opacity(0.35), in: Circle())
                        .padding(6)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if photo.isVideo {
                    Image(systemName: "video.fill")
                        .font(.caption2)
                        .foregroundStyle(.white)
                        .padding(6)
                        .background(.black.opacity(0.4), in: Capsule())
                        .padding(6)
                } else if photo.isLivePhoto {
                    Text("LIVE")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(.black.opacity(0.45), in: Capsule())
                        .padding(6)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture(perform: onTap)
            .onLongPressGesture(minimumDuration: 0.2, pressing: { pressing in
                guard photo.isLivePhoto else { return }
                onLivePressChanged(pressing)
            }, perform: {})
    }

    @ViewBuilder
    private var thumbnail: some View {
        let url = photo.isVideo ? photo.posterURL() : photo.listURL()
        ZStack {
            if let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        placeholder
                    case .empty:
                        ProgressView()
                    @unknown default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }

            if isLivePlaying, let liveURL = photo.liveVideoURL() {
                LiveVideoOverlay(url: liveURL)
            }
        }
    }

    private var placeholder: some View {
        Rectangle()
            .fill(TripTheme.sandDeep)
            .overlay {
                Image(systemName: "photo")
                    .foregroundStyle(TripTheme.inkMuted)
            }
    }
}

private struct LiveVideoOverlay: View {
    let url: URL
    @State private var player: AVPlayer?

    var body: some View {
        VideoPlayer(player: player)
            .disabled(true)
            .onAppear {
                let p = AVPlayer(url: url)
                p.isMuted = true
                player = p
                p.play()
            }
            .onDisappear {
                player?.pause()
                player = nil
            }
    }
}
