import SwiftUI

/// Edge-to-edge cork board — warm, tiled, lightly vignetted.
struct CorkBoardBackground: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height

            ZStack {
                TripTheme.corkBase

                Rectangle()
                    .fill(
                        ImagePaint(
                            image: Image("CorkTile"),
                            scale: 0.42
                        )
                    )

                // Depth: soft top light + bottom shade
                LinearGradient(
                    colors: [
                        Color.white.opacity(0.08),
                        .clear,
                        Color(red: 0.25, green: 0.16, blue: 0.08).opacity(0.20),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )

                RadialGradient(
                    colors: [
                        .clear,
                        Color(red: 0.31, green: 0.22, blue: 0.12).opacity(0.20),
                    ],
                    center: UnitPoint(x: 0.5, y: 0.42),
                    startRadius: min(w, h) * 0.2,
                    endRadius: max(w, h) * 0.72
                )

                // Corner pins
                DecorPin(tone: .rose)
                    .position(x: w * 0.07, y: h * 0.09)
                DecorPin(tone: .gold)
                    .position(x: w * 0.91, y: h * 0.13)
                DecorPin(tone: .sage)
                    .position(x: w * 0.89, y: h * 0.80)
                DecorPin(tone: .blue)
                    .position(x: w * 0.09, y: h * 0.87)

                // Washi tape scraps — torn paper feel
                WashiScrap(
                    color: Color(red: 0.94, green: 0.84, blue: 0.64),
                    width: 86,
                    rotation: -32
                )
                .position(x: w * 0.16, y: h * 0.17)

                WashiScrap(
                    color: Color(red: 0.70, green: 0.82, blue: 0.76),
                    width: 74,
                    rotation: 22
                )
                .position(x: w * 0.84, y: h * 0.21)

                WashiScrap(
                    color: Color(red: 0.88, green: 0.72, blue: 0.70),
                    width: 58,
                    rotation: 8
                )
                .position(x: w * 0.72, y: h * 0.74)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

private struct WashiScrap: View {
    let color: Color
    let width: CGFloat
    let rotation: Double

    var body: some View {
        Capsule()
            .fill(
                LinearGradient(
                    colors: [
                        color.opacity(0.75),
                        color.opacity(0.45),
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .overlay {
                Capsule()
                    .stroke(Color.white.opacity(0.25), lineWidth: 0.5)
            }
            .frame(width: width, height: 13)
            .shadow(color: .black.opacity(0.12), radius: 1.5, y: 1)
            .rotationEffect(.degrees(rotation))
    }
}

private enum PinTone {
    case rose, gold, sage, blue

    var color: Color {
        switch self {
        case .rose: Color(red: 0.78, green: 0.42, blue: 0.45)
        case .gold: Color(red: 0.82, green: 0.68, blue: 0.32)
        case .sage: Color(red: 0.53, green: 0.65, blue: 0.47)
        case .blue: Color(red: 0.45, green: 0.58, blue: 0.72)
        }
    }
}

private struct DecorPin: View {
    let tone: PinTone

    var body: some View {
        ZStack {
            Ellipse()
                .fill(Color.black.opacity(0.18))
                .frame(width: 14, height: 5)
                .blur(radius: 0.8)
                .offset(y: 5)

            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white.opacity(0.55),
                            tone.color,
                            tone.color.opacity(0.75),
                        ],
                        center: UnitPoint(x: 0.32, y: 0.28),
                        startRadius: 0.5,
                        endRadius: 8
                    )
                )
                .frame(width: 11, height: 11)
                .overlay {
                    Circle()
                        .stroke(Color.black.opacity(0.12), lineWidth: 0.5)
                }
        }
    }
}
