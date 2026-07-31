import SwiftUI

/// Polaroid / board print for a wall item — fixed width so AsyncImage cannot blow layout.
struct PolaroidCard: View {
    let item: WallItem
    var width: CGFloat
    var isPressed: Bool = false

    private var rotation: Double {
        PolaroidLayout.rotation(for: item.id)
    }

    private var pinTone: PushpinTone {
        PushpinTone.all[PolaroidLayout.hash(item.id) % PushpinTone.all.count]
    }

    private var scaledWidth: CGFloat {
        width * item.printScale
    }

    private var photoAspect: CGFloat {
        switch item.orientation {
        case .landscape: 3.0 / 2.0
        case .portrait: 5.0 / 6.0
        case .square, .none: 1.0
        }
    }

    private var showLabels: Bool {
        if item.hideLabels == true { return false }
        if item.kind == .empty { return true }
        return !item.caption.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !item.footerMeta.isEmpty
    }

    var body: some View {
        ZStack(alignment: .top) {
            paperBody
                .padding(.top, 6)

            PushpinView(tone: pinTone)
                .offset(y: -2)
                .zIndex(2)
        }
        .frame(width: scaledWidth)
        .rotationEffect(.degrees(isPressed ? rotation * 0.15 : rotation))
        .scaleEffect(isPressed ? 1.04 : 1)
        .offset(y: isPressed ? -4 : 0)
        .animation(.spring(duration: 0.42, bounce: 0.42), value: isPressed)
    }

    private var paperBody: some View {
        VStack(spacing: 0) {
            photoWell
                .padding(.horizontal, border)
                .padding(.top, border)

            if showLabels {
                footer
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, border)
                    .padding(.top, 8)
                    .padding(.bottom, 10)
            } else {
                Color.clear.frame(height: border)
            }
        }
        .frame(width: scaledWidth)
        .background {
            ZStack {
                TripTheme.polaroidPaper
                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color.white.opacity(0.55),
                                .clear,
                                Color(red: 0.55, green: 0.45, blue: 0.32).opacity(0.04),
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .strokeBorder(
                        LinearGradient(
                            colors: [Color.white.opacity(0.9), Color.black.opacity(0.04)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 0.8
                    )
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 2.5, style: .continuous))
        .overlay {
            if item.isPlanned || item.kind == .empty {
                RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                    .strokeBorder(style: StrokeStyle(lineWidth: 1.3, dash: [5, 4]))
                    .foregroundStyle(Color(red: 0.35, green: 0.27, blue: 0.20).opacity(0.28))
                    .padding(5)
            }
        }
        .shadow(
            color: Color(red: 0.26, green: 0.18, blue: 0.09).opacity(isPressed ? 0.26 : 0.14),
            radius: isPressed ? 18 : 7,
            y: isPressed ? 12 : 5
        )
        .shadow(
            color: Color(red: 0.26, green: 0.18, blue: 0.09).opacity(0.08),
            radius: isPressed ? 28 : 16,
            y: isPressed ? 20 : 12
        )
    }

    private var border: CGFloat { max(8, scaledWidth * 0.045) }

    private var photoWell: some View {
        // Color.clear + overlay keeps AsyncImage from expanding the layout.
        Color.clear
            .aspectRatio(photoAspect, contentMode: .fit)
            .overlay { photoContent }
            .clipped()
            .overlay {
                Rectangle()
                    .strokeBorder(Color.black.opacity(0.06), lineWidth: 0.5)
            }
    }

    @ViewBuilder
    private var photoContent: some View {
        ZStack {
            Color(red: 0.18, green: 0.15, blue: 0.12)

            if item.kind == .empty {
                emptyWell
            } else if let src = item.src, let url = MediaURLs.absoluteURL(src) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
                    case .failure:
                        coverFallback
                    case .empty:
                        coverFallback
                            .overlay { ProgressView().tint(.white.opacity(0.6)) }
                    @unknown default:
                        coverFallback
                    }
                }
            } else {
                coverFallback
            }

            LinearGradient(
                colors: [
                    Color.black.opacity(0.06),
                    .clear,
                    .clear,
                    Color.black.opacity(0.10),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .allowsHitTesting(false)

            if item.isPlanned {
                Text("Planning")
                    .font(.system(size: 8, weight: .bold))
                    .tracking(0.7)
                    .textCase(.uppercase)
                    .foregroundStyle(TripTheme.coral)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(.white.opacity(0.94), in: Capsule())
                    .overlay { Capsule().stroke(TripTheme.coral.opacity(0.3), lineWidth: 1) }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(8)
            }
        }
    }

    private var emptyWell: some View {
        ZStack {
            Color(red: 0.94, green: 0.91, blue: 0.86)
            VStack(spacing: 8) {
                Text("+")
                    .font(.system(size: 22, weight: .ultraLight))
                    .frame(width: 36, height: 36)
                    .overlay {
                        Circle().strokeBorder(style: StrokeStyle(lineWidth: 1.4, dash: [4, 3]))
                            .foregroundStyle(TripTheme.inkMuted)
                    }
                Text("Next adventure")
                    .font(.system(size: 10, weight: .medium))
                    .tracking(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(TripTheme.inkMuted)
            }
        }
    }

    private var coverFallback: some View {
        ZStack(alignment: .bottomLeading) {
            let hexes = Self.hexColors(in: item.coverGradient)
            let colors = hexes.compactMap(Color.init(hex:))
            LinearGradient(
                colors: colors.count >= 2 ? colors : [TripTheme.sea.opacity(0.85), TripTheme.coral.opacity(0.75)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            LinearGradient(
                colors: [Color.white.opacity(0.12), .clear],
                startPoint: .topLeading,
                endPoint: UnitPoint(x: 0.55, y: 0.45)
            )
            LinearGradient(
                colors: [.clear, Color.black.opacity(0.15), Color.black.opacity(0.55)],
                startPoint: .top,
                endPoint: .bottom
            )

            if let emoji = item.coverEmoji, !emoji.isEmpty {
                Text(emoji)
                    .font(.system(size: max(22, scaledWidth * 0.12)))
                    .frame(width: 40, height: 40)
                    .background(.white.opacity(0.28), in: Circle())
                    .overlay { Circle().stroke(.white.opacity(0.5), lineWidth: 1) }
                    .rotationEffect(.degrees(-8))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(10)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(item.isPlanned ? "Up next" : "Journey")
                    .font(.system(size: 8, weight: .medium))
                    .tracking(1.6)
                    .textCase(.uppercase)
                    .foregroundStyle(.white.opacity(0.78))
                Text(item.caption)
                    .font(TripTheme.serif(max(15, scaledWidth * 0.075)))
                    .foregroundStyle(.white)
                    .lineLimit(2)
            }
            .padding(10)
        }
    }

    private var footer: some View {
        VStack(spacing: 1) {
            if !item.caption.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(item.caption)
                    .font(TripTheme.hand(max(14, scaledWidth * 0.078)))
                    .foregroundStyle(TripTheme.polaroidInk)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            if !item.footerMeta.isEmpty {
                Text(item.footerMeta)
                    .font(.system(size: max(9, scaledWidth * 0.042), weight: .regular))
                    .tracking(0.15)
                    .foregroundStyle(TripTheme.polaroidMeta)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
    }

    private static func hexColors(in value: String?) -> [String] {
        guard let value else { return [] }
        let pattern = "#[0-9a-fA-F]{6}"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        return regex.matches(in: value, range: range).compactMap { match in
            Range(match.range, in: value).map { String(value[$0]) }
        }
    }
}

/// Yellow sticky note matching web `.wall-note`.
struct StickyNoteCard: View {
    let item: WallItem
    var width: CGFloat

    private var rotation: Double {
        PolaroidLayout.rotation(for: item.id) * 0.55
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(item.caption)
                .font(TripTheme.hand(20))
                .foregroundStyle(TripTheme.polaroidInk)

            if let lines = item.noteLines {
                ForEach(lines, id: \.self) { line in
                    Text(line)
                        .font(.system(size: 12))
                        .foregroundStyle(TripTheme.ink.opacity(0.78))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if let signature = item.noteSignature, !signature.isEmpty {
                Text(signature)
                    .font(TripTheme.hand(13))
                    .foregroundStyle(TripTheme.inkMuted)
                    .padding(.top, 6)
            }
        }
        .padding(.top, 22)
        .padding(.horizontal, 14)
        .padding(.bottom, 14)
        .frame(width: width, alignment: .leading)
        .frame(minHeight: width * 0.95, alignment: .topLeading)
        .background {
            LinearGradient(
                colors: [
                    Color(red: 1.0, green: 0.965, blue: 0.784),
                    Color(red: 0.961, green: 0.902, blue: 0.627),
                    Color(red: 0.937, green: 0.847, blue: 0.541),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
        .overlay(alignment: .top) {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color(red: 0.85, green: 0.28, blue: 0.28),
                            Color(red: 0.45, green: 0.10, blue: 0.10),
                        ],
                        center: .topLeading,
                        startRadius: 1,
                        endRadius: 7
                    )
                )
                .frame(width: 12, height: 12)
                .shadow(color: .black.opacity(0.25), radius: 1, y: 1)
                .offset(y: -5)
        }
        .shadow(color: Color(red: 0.31, green: 0.22, blue: 0.12).opacity(0.16), radius: 8, y: 5)
        .rotationEffect(.degrees(rotation))
    }
}

enum PushpinTone: CaseIterable {
    case ruby, brass, sage, steel

    static let all: [PushpinTone] = [.ruby, .brass, .sage, .steel]

    var head: [Color] {
        switch self {
        case .ruby:
            [
                Color(red: 0.95, green: 0.45, blue: 0.42),
                Color(red: 0.72, green: 0.14, blue: 0.16),
                Color(red: 0.42, green: 0.08, blue: 0.10),
            ]
        case .brass:
            [
                Color(red: 0.96, green: 0.85, blue: 0.45),
                Color(red: 0.78, green: 0.58, blue: 0.18),
                Color(red: 0.48, green: 0.32, blue: 0.10),
            ]
        case .sage:
            [
                Color(red: 0.72, green: 0.84, blue: 0.62),
                Color(red: 0.42, green: 0.58, blue: 0.36),
                Color(red: 0.22, green: 0.34, blue: 0.20),
            ]
        case .steel:
            [
                Color(red: 0.82, green: 0.88, blue: 0.94),
                Color(red: 0.42, green: 0.52, blue: 0.62),
                Color(red: 0.22, green: 0.28, blue: 0.36),
            ]
        }
    }
}

struct PushpinView: View {
    var tone: PushpinTone = .ruby

    var body: some View {
        ZStack {
            Ellipse()
                .fill(Color(red: 0.21, green: 0.15, blue: 0.08).opacity(0.30))
                .frame(width: 22, height: 6)
                .blur(radius: 1.2)
                .offset(x: 2, y: 8)

            Capsule()
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 0.85, green: 0.85, blue: 0.88),
                            Color(red: 0.48, green: 0.48, blue: 0.52),
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: 2.2, height: 11)
                .offset(y: 8)

            Circle()
                .fill(
                    RadialGradient(
                        colors: tone.head,
                        center: UnitPoint(x: 0.32, y: 0.28),
                        startRadius: 0.5,
                        endRadius: 8
                    )
                )
                .frame(width: 13, height: 13)
                .overlay {
                    Circle().stroke(Color.black.opacity(0.15), lineWidth: 0.5)
                }
                .overlay(alignment: .topLeading) {
                    Circle()
                        .fill(.white.opacity(0.55))
                        .frame(width: 4, height: 4)
                        .offset(x: 2.5, y: 2)
                }
                .shadow(color: .black.opacity(0.35), radius: 1.2, y: 1)
        }
        .frame(width: 20, height: 22)
    }
}

enum PolaroidLayout {
    private static let angles: [Double] = [-3.2, 2.4, -1.7, 3.6, -2.6, 1.4, -0.9, 2.9]

    static func rotation(for id: String) -> Double {
        angles[hash(id) % angles.count]
    }

    static func drift(for id: String) -> CGFloat {
        let drifts: [CGFloat] = [-8, 6, -5, 9, -10, 4, -3, 7]
        return drifts[hash(id) % drifts.count]
    }

    static func hash(_ s: String) -> Int {
        var h = 0
        for u in s.utf8 {
            h = (h &+ Int(u) &+ ((h &<< 5) &- h))
        }
        return h == .min ? 0 : abs(h)
    }
}
