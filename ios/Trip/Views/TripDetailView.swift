import Observation
import SwiftUI

@Observable
@MainActor
final class TripDetailViewModel {
    let tripId: String

    private(set) var trip: Trip?
    private(set) var photos: [PhotoMeta] = []
    private(set) var notes: [Comment] = []
    private(set) var isLoadingTrip = false
    private(set) var isLoadingPhotos = false
    private(set) var isLoadingNotes = false
    private(set) var tripError: String?
    private(set) var photosError: String?
    private(set) var notesError: String?

    /// True while waiting for freshly uploaded media to become gallery-ready.
    private(set) var isProcessingUploads = false

    var selectedStopId: String?

    private let client: TripAPIClient
    private var uploadPollTask: Task<Void, Never>?

    init(tripId: String, seed: Trip? = nil, client: TripAPIClient = TripAPIClient()) {
        self.tripId = tripId
        self.trip = seed
        self.client = client
    }

    func load() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.loadTrip() }
            group.addTask { await self.loadPhotos() }
            group.addTask { await self.loadNotes() }
        }
    }

    func loadTrip() async {
        isLoadingTrip = true
        tripError = nil
        defer { isLoadingTrip = false }
        do {
            trip = try await client.trip(id: tripId)
        } catch {
            tripError = error.localizedDescription
            // Keep seed trip visible if refresh fails.
        }
    }

    func loadPhotos(showSpinner: Bool = true) async {
        if showSpinner { isLoadingPhotos = true }
        photosError = nil
        defer { if showSpinner { isLoadingPhotos = false } }
        do {
            photos = try await client.photos(tripId: tripId)
        } catch {
            photosError = error.localizedDescription
            if showSpinner { photos = [] }
        }
    }

    /// Poll gallery until uploaded ids appear as ready (GET only returns ready), or timeout.
    func refreshPhotosAfterUpload(expecting uploadedIds: [String]) async {
        uploadPollTask?.cancel()
        await loadPhotos(showSpinner: photos.isEmpty)

        let expected = Set(uploadedIds)
        guard !expected.isEmpty else { return }

        isProcessingUploads = true
        uploadPollTask = Task { @MainActor in
            defer { self.isProcessingUploads = false }

            let interval: Duration = .seconds(2)
            let maxAttempts = 15 // ~30s
            for _ in 0..<maxAttempts {
                if Task.isCancelled { return }
                let readyIds = Set(self.photos.map(\.id))
                if expected.isSubset(of: readyIds) { return }
                try? await Task.sleep(for: interval)
                if Task.isCancelled { return }
                await self.loadPhotos(showSpinner: false)
            }
            // Final refresh even if some are still processing.
            await self.loadPhotos(showSpinner: false)
        }
        await uploadPollTask?.value
    }

    func loadNotes() async {
        isLoadingNotes = true
        notesError = nil
        defer { isLoadingNotes = false }
        do {
            notes = try await client.comments(tripId: tripId, scope: .trip)
        } catch {
            notesError = error.localizedDescription
            notes = []
        }
    }

    func postNote(author: String, body: String) async throws {
        let comment = try await client.postComment(
            tripId: tripId,
            author: author,
            body: body
        )
        notes.insert(comment, at: 0)
    }
}

enum TripDetailSection: String, CaseIterable, Identifiable {
    case plan
    case photos
    case notes

    var id: String { rawValue }

    func title(planned: Bool) -> String {
        switch self {
        case .plan: planned ? "Plan" : "Itinerary"
        case .photos: "Photos"
        case .notes: "Notes"
        }
    }
}

struct TripDetailView: View {
    @State private var model: TripDetailViewModel
    @State private var section: TripDetailSection = .plan

    init(tripId: String) {
        _model = State(initialValue: TripDetailViewModel(tripId: tripId))
    }

    /// Prefer list payload for an instant hero, then refresh from the detail API.
    init(trip: Trip) {
        _model = State(initialValue: TripDetailViewModel(tripId: trip.id, seed: trip))
    }

    var body: some View {
        Group {
            if let trip = model.trip {
                detailContent(trip)
            } else if model.isLoadingTrip {
                ProgressView("Loading trip…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView {
                    Label("Trip unavailable", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(model.tripError ?? "Something went wrong.")
                } actions: {
                    Button("Retry") {
                        Task { await model.load() }
                    }
                }
            }
        }
        .background(TripTheme.pageBackground.ignoresSafeArea())
        .task {
            await model.load()
        }
        .refreshable {
            await model.load()
        }
    }

    @ViewBuilder
    private func detailContent(_ trip: Trip) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                TripHeroView(trip: trip)

                TripSectionTabBar(
                    tabs: sectionTabs(planned: trip.isPlanned),
                    selection: $section,
                    planned: trip.isPlanned
                )
                .padding(.top, 4)

                Group {
                    switch section {
                    case .plan:
                        ItinerarySection(
                            days: trip.days,
                            mapStops: trip.mapStops,
                            planned: trip.isPlanned,
                            durationDays: trip.durationDays,
                            selectedStopId: $model.selectedStopId
                        )
                        .padding(.horizontal, 20)
                        .padding(.top, 28)
                        .padding(.bottom, 40)
                    case .photos:
                        PhotoGallerySection(
                            tripId: trip.id,
                            photos: model.photos,
                            isLoading: model.isLoadingPhotos,
                            isProcessingUploads: model.isProcessingUploads,
                            errorMessage: model.photosError,
                            onUploadFinished: { uploadedIds in
                                Task {
                                    await model.refreshPhotosAfterUpload(expecting: uploadedIds)
                                }
                            }
                        )
                        .padding(.horizontal, 20)
                        .padding(.top, 28)
                        .padding(.bottom, 40)
                    case .notes:
                        NotesSection(
                            notes: model.notes,
                            isLoading: model.isLoadingNotes,
                            errorMessage: model.notesError,
                            planned: trip.isPlanned,
                            onPost: { author, body in
                                try await model.postNote(author: author, body: body)
                            }
                        )
                        .padding(.horizontal, 20)
                        .padding(.top, 28)
                        .padding(.bottom, 40)
                    }
                }
                .animation(.easeInOut(duration: 0.2), value: section)
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if trip.isPlanned {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(TripTheme.sea)
                            .frame(width: 6, height: 6)
                        Text("Planning")
                            .font(.system(size: 10, weight: .semibold))
                            .tracking(1.4)
                            .textCase(.uppercase)
                            .foregroundStyle(TripTheme.inkSoft)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(.white.opacity(0.6), in: Capsule())
                    .overlay {
                        Capsule()
                            .stroke(TripTheme.ink.opacity(0.1), lineWidth: 1)
                    }
                }
            }
        }
        .toolbarBackground(TripTheme.sand.opacity(0.92), for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
    }

    private func sectionTabs(planned: Bool) -> [TripDetailSection] {
        planned ? [.plan, .notes, .photos] : [.plan, .photos, .notes]
    }
}

// MARK: - Editorial hero (soft gradient, not photo)

struct TripHeroView: View {
    let trip: Trip

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: trip.editorialHeroColors,
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            // Soft light wash — keeps cover colors visible without a photo overlay.
            RadialGradient(
                colors: [.white.opacity(0.38), .clear],
                center: UnitPoint(x: 0.75, y: 0),
                startRadius: 0,
                endRadius: 220
            )

            LinearGradient(
                colors: [.white.opacity(0.15), .clear, .black.opacity(0.06)],
                startPoint: .top,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    if trip.isPlanned {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(TripTheme.sea)
                                .frame(width: 6, height: 6)
                            Text("Planning")
                                .font(.system(size: 10, weight: .semibold))
                                .tracking(1.4)
                                .textCase(.uppercase)
                                .foregroundStyle(TripTheme.inkSoft)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(.white.opacity(0.6), in: Capsule())
                        .overlay {
                            Capsule()
                                .stroke(TripTheme.ink.opacity(0.1), lineWidth: 1)
                        }
                    }

                    Text(trip.destination)
                        .font(.system(size: 12, weight: .medium))
                        .tracking(1.8)
                        .textCase(.uppercase)
                        .foregroundStyle(TripTheme.inkSoft.opacity(0.8))
                }

                Text(trip.title)
                    .font(TripTheme.serif(36, weight: .regular))
                    .foregroundStyle(TripTheme.ink)
                    .padding(.top, 8)

                if !trip.subtitle.isEmpty {
                    Text(trip.subtitle)
                        .font(.system(size: 16))
                        .foregroundStyle(TripTheme.inkSoft)
                        .padding(.top, 8)
                }

                FlowChips {
                    FrostChip(text: trip.isPlanned
                        ? "\(trip.dateRangeLabel) · draft"
                        : trip.dateRangeLabel)
                    FrostChip(text: trip.durationDays == 1
                        ? "1 day"
                        : "\(trip.durationDays) days")
                    ForEach(trip.members, id: \.self) { member in
                        FrostChip(text: member)
                    }
                }
                .padding(.top, 20)

                if !trip.summary.isEmpty {
                    Text(trip.summary)
                        .font(.system(size: 14))
                        .foregroundStyle(TripTheme.inkSoft.opacity(0.9))
                        .lineSpacing(3)
                        .padding(.top, 16)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 28)
            .padding(.bottom, 28)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(TripTheme.sand200.opacity(0.6))
                .frame(height: 1)
        }
    }
}

private struct FrostChip: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(TripTheme.inkSoft)
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(TripTheme.frostChip, in: Capsule())
            .background(.ultraThinMaterial, in: Capsule())
    }
}

/// Simple wrapping chip row without LazyVGrid complexity.
private struct FlowChips<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        // iOS 16+ Layout that wraps; keeps chips calm and editorial.
        FlexibleChipLayout(spacing: 8) {
            content
        }
    }
}

/// Horizontal wrap layout for frosted meta chips.
private struct FlexibleChipLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, origin) in result.origins.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y),
                proposal: .unspecified
            )
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, origins: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var origins: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var widthUsed: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            origins.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            widthUsed = max(widthUsed, x - spacing)
        }

        return (CGSize(width: widthUsed, height: y + rowHeight), origins)
    }
}

// MARK: - Custom section tabs (ink pill, not SegmentedControl)

struct TripSectionTabBar: View {
    let tabs: [TripDetailSection]
    @Binding var selection: TripDetailSection
    let planned: Bool

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    Text("Jump to")
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(1.6)
                        .textCase(.uppercase)
                        .foregroundStyle(TripTheme.inkMuted)
                        .padding(.trailing, 4)

                    ForEach(Array(tabs.enumerated()), id: \.element.id) { index, tab in
                        let isOn = selection == tab
                        Button {
                            withAnimation(.easeInOut(duration: 0.18)) {
                                selection = tab
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Text(String(format: "%02d", index + 1))
                                    .font(.system(size: 10, weight: .semibold).monospacedDigit())
                                    .foregroundStyle(isOn ? .white.opacity(0.55) : TripTheme.inkMuted)
                                Text(tab.title(planned: planned))
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(isOn ? .white : TripTheme.inkSoft)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 9)
                            .background {
                                if isOn {
                                    Capsule().fill(TripTheme.ink)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
            }

            Rectangle()
                .fill(TripTheme.sand200.opacity(0.7))
                .frame(height: 1)
        }
        .background(TripTheme.sand.opacity(0.9))
    }
}

// MARK: - Notes

struct NotesSection: View {
    let notes: [Comment]
    let isLoading: Bool
    let errorMessage: String?
    var planned: Bool = false
    var onPost: (String, String) async throws -> Void

    @State private var author = UploaderIdentity.name
    @State private var draft = ""
    @State private var isPosting = false
    @State private var postError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Notes")
                    .font(TripTheme.serif(28, weight: .regular))
                    .foregroundStyle(TripTheme.ink)
                Text(
                    planned
                        ? "Group chat for this trip — who’s in, ideas, reminders."
                        : "For the whole group. Photo comments live on each photo."
                )
                .font(.system(size: 14))
                .foregroundStyle(TripTheme.inkMuted)
            }

            VStack(alignment: .leading, spacing: 10) {
                TextField("Your name", text: $author)
                    .textFieldStyle(.plain)
                    .padding(12)
                    .background(TripTheme.sand.opacity(0.55), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(TripTheme.sand200, lineWidth: 1)
                    }
                    .textContentType(.name)
                TextField("Write a note…", text: $draft, axis: .vertical)
                    .textFieldStyle(.plain)
                    .padding(12)
                    .lineLimit(3...6)
                    .background(TripTheme.sand.opacity(0.55), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(TripTheme.sand200, lineWidth: 1)
                    }
                if let postError {
                    Text(postError)
                        .font(.caption)
                        .foregroundStyle(TripTheme.coral)
                }
                Button {
                    Task { await submit() }
                } label: {
                    if isPosting {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 4)
                    } else {
                        Text("Post note")
                            .font(.system(size: 14, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 4)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(TripTheme.ink)
                .disabled(isPosting || !canPost)
            }
            .padding(16)
            .background(TripTheme.panelFill, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(TripTheme.sand200.opacity(0.8), lineWidth: 1)
            }

            if isLoading && notes.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
            } else if let errorMessage, notes.isEmpty {
                Text(errorMessage)
                    .foregroundStyle(TripTheme.inkMuted)
            } else if notes.isEmpty {
                Text("No notes yet.")
                    .foregroundStyle(TripTheme.inkMuted)
                    .padding(.vertical, 12)
            } else {
                ForEach(notes) { note in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(note.author)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(TripTheme.sea)
                            Spacer()
                            Text(note.createdAt.prefix(10))
                                .font(.caption)
                                .foregroundStyle(TripTheme.inkMuted)
                        }
                        Text(note.body)
                            .font(.body)
                            .foregroundStyle(TripTheme.ink)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(TripTheme.panelFill, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(TripTheme.sand200.opacity(0.8), lineWidth: 1)
                    }
                }
            }
        }
    }

    private var canPost: Bool {
        !author.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func submit() async {
        let name = author.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, !body.isEmpty else { return }
        isPosting = true
        postError = nil
        defer { isPosting = false }
        do {
            UploaderIdentity.name = name
            try await onPost(name, body)
            draft = ""
        } catch {
            postError = error.localizedDescription
        }
    }
}
