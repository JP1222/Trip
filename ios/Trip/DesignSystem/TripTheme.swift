import SwiftUI

/// Visual tokens aligned with the web journal (sand / ink / sea / coral).
enum TripTheme {
    static let sand = Color(red: 0.969, green: 0.957, blue: 0.937) // #f7f4ef
    static let sand100 = Color(red: 0.937, green: 0.918, blue: 0.886) // #efeae2
    static let sand200 = Color(red: 0.878, green: 0.847, blue: 0.800) // #e0d8cc
    static let sand300 = Color(red: 0.812, green: 0.769, blue: 0.706) // #cfc4b4
    static let ink = Color(red: 0.110, green: 0.102, blue: 0.090) // #1c1a17
    static let inkSoft = Color(red: 0.290, green: 0.271, blue: 0.243) // #4a453e
    static let inkMuted = Color(red: 0.541, green: 0.510, blue: 0.471) // #8a8278
    static let sea = Color(red: 0.239, green: 0.400, blue: 0.392) // #3d6664
    static let coral = Color(red: 0.710, green: 0.416, blue: 0.306) // #b56a4e
    static let sandDeep = Color(red: 0.914, green: 0.875, blue: 0.820)
    /// Soft mist blue used in editorial hero washes.
    static let mist = Color(red: 0.894, green: 0.925, blue: 0.922) // #e4eceb

    static let pageBackground = sand

    /// Frosted white chip fill (web `bg-white/65`).
    static let frostChip = Color.white.opacity(0.65)
    /// Soft panel fill for map / list chrome.
    static let panelFill = Color.white.opacity(0.70)
}

extension Trip {
    /// Soft editorial hero wash — muted cover stops, never a photo hero.
    var editorialHeroColors: [Color] {
        let colors = Self.hexColors(in: coverGradient).compactMap(Color.init(hex:))
        if colors.count >= 2 {
            return colors.map { $0.opacity(0.55) }
        }
        // Muted blue → sand fallback (matches web scrapbook feel).
        return [TripTheme.mist, TripTheme.sand100, TripTheme.sand]
    }

    /// Hex stops parsed from the stored Tailwind-style `coverGradient` string.
    var coverColors: [Color] {
        let colors = Self.hexColors(in: coverGradient).compactMap(Color.init(hex:))
        if colors.count >= 2 { return colors }
        return [TripTheme.sea.opacity(0.85), TripTheme.coral.opacity(0.75)]
    }

    private static func hexColors(in value: String) -> [String] {
        let pattern = "#[0-9a-fA-F]{6}"
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        return regex.matches(in: value, range: range).compactMap { match in
            Range(match.range, in: value).map { String(value[$0]) }
        }
    }

    var isPlanned: Bool { status == .planned }

    var dateRangeLabel: String {
        Self.formatDateRange(start: startDate, end: endDate)
    }

    /// Inclusive day count (matches web `tripDurationDays`).
    var durationDays: Int {
        Self.durationDays(start: startDate, end: endDate)
    }

    private static func parseDay(_ value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: String(value.prefix(10)))
    }

    private static func durationDays(start: String, end: String) -> Int {
        guard let startDate = parseDay(start), let endDate = parseDay(end) else { return 1 }
        let days = Calendar.current.dateComponents([.day], from: startDate, to: endDate).day ?? 0
        return max(1, days + 1)
    }

    private static func formatDateRange(start: String, end: String) -> String {
        guard let startDate = parseDay(start), let endDate = parseDay(end) else {
            return "\(start) – \(end)"
        }

        let display = DateFormatter()
        display.locale = Locale(identifier: "en_US")
        display.setLocalizedDateFormatFromTemplate("MMMMd")
        let year = Calendar.current.component(.year, from: startDate)
        if Calendar.current.isDate(startDate, equalTo: endDate, toGranularity: .day) {
            return "\(year) · \(display.string(from: startDate))"
        }
        return "\(year) · \(display.string(from: startDate)) – \(display.string(from: endDate))"
    }

    static func formatDayChipDate(_ iso: String) -> String {
        guard let date = parseDay(iso) else { return iso }
        let display = DateFormatter()
        display.locale = Locale(identifier: "en_US")
        display.setLocalizedDateFormatFromTemplate("MMMd")
        return display.string(from: date)
    }
}

extension Color {
    init?(hex: String) {
        var raw = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.hasPrefix("#") { raw.removeFirst() }
        guard raw.count == 6, let value = UInt64(raw, radix: 16) else { return nil }
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
