import Observation
import SwiftUI

@Observable
@MainActor
final class HomeViewModel {
    private(set) var items: [WallItem] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var hasAppeared = false

    private let client: TripAPIClient

    init(client: TripAPIClient = TripAPIClient()) {
        self.client = client
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            items = try await client.wall()
            hasAppeared = true
        } catch {
            errorMessage = error.localizedDescription
            items = []
        }
    }
}

struct HomeView: View {
    @State private var model = HomeViewModel()
    @State private var pressedId: String?
    @State private var previewPhoto: WallItem?
    @Environment(\.horizontalSizeClass) private var sizeClass

    /// Phone: denser 2-up board; iPad: a bit wider prints.
    private var baseCardWidth: CGFloat {
        sizeClass == .compact ? 156 : 200
    }

    private var columns: [GridItem] {
        if sizeClass == .compact {
            return [
                GridItem(.flexible(), spacing: 14),
                GridItem(.flexible(), spacing: 14),
            ]
        }
        return [GridItem(.adaptive(minimum: 170, maximum: 220), spacing: 22, alignment: .top)]
    }

    var body: some View {
        NavigationStack {
            ZStack {
                CorkBoardBackground()

                Group {
                    if model.isLoading && model.items.isEmpty {
                        loadingChip
                    } else if let errorMessage = model.errorMessage, model.items.isEmpty {
                        errorCard(errorMessage)
                    } else if model.items.isEmpty {
                        emptyCard
                    } else {
                        wallGrid
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { tripId in
                TripDetailView(tripId: tripId)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await model.load() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.95))
                            .frame(width: 34, height: 34)
                            .background(Color.black.opacity(0.22), in: Circle())
                            .overlay {
                                Circle().stroke(Color.white.opacity(0.18), lineWidth: 0.5)
                            }
                    }
                    .disabled(model.isLoading)
                    .accessibilityLabel("Refresh")
                }
            }
            .task { await model.load() }
            .refreshable { await model.load() }
            .fullScreenCover(item: $previewPhoto) { photo in
                WallPhotoPreview(item: photo)
            }
        }
    }

    private var loadingChip: some View {
        HStack(spacing: 10) {
            ProgressView().tint(TripTheme.ink)
            Text("Pinning the board…")
                .font(TripTheme.hand(18))
                .foregroundStyle(TripTheme.ink)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .background(TripTheme.polaroidPaper.opacity(0.92), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.15), radius: 12, y: 6)
    }

    private func errorCard(_ message: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 28, weight: .light))
                .foregroundStyle(TripTheme.coral)
            Text("Couldn’t load the board")
                .font(TripTheme.serif(22))
                .foregroundStyle(TripTheme.ink)
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(TripTheme.inkMuted)
                .multilineTextAlignment(.center)
            Button("Retry") { Task { await model.load() } }
                .buttonStyle(.borderedProminent)
                .tint(TripTheme.sea)
        }
        .padding(28)
        .frame(maxWidth: 320)
        .background(TripTheme.polaroidPaper.opacity(0.95), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.18), radius: 16, y: 8)
        .padding(24)
    }

    private var emptyCard: some View {
        VStack(spacing: 12) {
            Text("+")
                .font(.system(size: 36, weight: .ultraLight))
                .foregroundStyle(TripTheme.inkMuted)
            Text("Next adventure")
                .font(TripTheme.hand(22))
                .foregroundStyle(TripTheme.ink)
            Text("When trips land on the board, they’ll show up here.")
                .font(.system(size: 13))
                .foregroundStyle(TripTheme.inkMuted)
                .multilineTextAlignment(.center)
        }
        .padding(28)
        .frame(maxWidth: 300)
        .background(TripTheme.polaroidPaper.opacity(0.95), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.15), radius: 14, y: 7)
    }

    private var wallGrid: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 22) {
                ForEach(Array(model.items.enumerated()), id: \.element.id) { index, item in
                    wallCell(item)
                        .padding(.top, 10)
                        .offset(x: PolaroidLayout.drift(for: item.id) * 0.2)
                        .opacity(model.hasAppeared ? 1 : 0)
                        .offset(y: model.hasAppeared ? 0 : 14)
                        .animation(
                            .spring(duration: 0.5, bounce: 0.32)
                                .delay(Double(min(index, 12)) * 0.04),
                            value: model.hasAppeared
                        )
                }
            }
            .padding(.horizontal, sizeClass == .compact ? 16 : 24)
            .padding(.top, 6)
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
    }

    @ViewBuilder
    private func wallCell(_ item: WallItem) -> some View {
        switch item.kind {
        case .note:
            StickyNoteCard(item: item, width: baseCardWidth * 0.98)
                .frame(maxWidth: .infinity)

        case .empty:
            PolaroidCard(item: item, width: baseCardWidth, isPressed: false)
                .frame(maxWidth: .infinity)
                .allowsHitTesting(false)

        case .photo:
            Button {
                previewPhoto = item
            } label: {
                PolaroidCard(
                    item: item,
                    width: baseCardWidth,
                    isPressed: pressedId == item.id
                )
            }
            .buttonStyle(WallPressStyle(id: item.id, pressedId: $pressedId))
            .frame(maxWidth: .infinity)

        case .trip:
            if let tripId = item.tripId {
                NavigationLink(value: tripId) {
                    PolaroidCard(
                        item: item,
                        width: baseCardWidth,
                        isPressed: pressedId == item.id
                    )
                }
                .buttonStyle(WallPressStyle(id: item.id, pressedId: $pressedId))
                .tint(TripTheme.polaroidInk)
                .frame(maxWidth: .infinity)
            } else {
                PolaroidCard(item: item, width: baseCardWidth)
                    .frame(maxWidth: .infinity)
            }
        }
    }
}

private struct WallPressStyle: ButtonStyle {
    let id: String
    @Binding var pressedId: String?

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .onChange(of: configuration.isPressed) { _, pressed in
                pressedId = pressed ? id : nil
            }
    }
}

private struct WallPhotoPreview: View {
    let item: WallItem
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let src = item.src, let url = MediaURLs.absoluteURL(src) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFit()
                            .padding(12)
                    case .empty:
                        ProgressView().tint(.white)
                    default:
                        Image(systemName: "photo")
                            .foregroundStyle(.white.opacity(0.5))
                    }
                }
            }
        }
        .overlay(alignment: .topTrailing) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(10)
                    .background(.white.opacity(0.15), in: Circle())
            }
            .padding(16)
        }
        .overlay(alignment: .bottom) {
            VStack(spacing: 4) {
                if !item.caption.isEmpty {
                    Text(item.caption)
                        .font(TripTheme.hand(22))
                        .foregroundStyle(.white)
                }
                if !item.footerMeta.isEmpty {
                    Text(item.footerMeta)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.75))
                }
            }
            .padding(20)
        }
        .onTapGesture { dismiss() }
    }
}

#Preview {
    HomeView()
}
