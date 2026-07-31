import SwiftUI

struct ItinerarySection: View {
    let days: [DayPlan]
    let mapStops: [MapStop]
    var planned: Bool = false
    var durationDays: Int = 0
    @Binding var selectedStopId: String?

    /// `nil` means “All days”.
    @State private var dayFilter: Int?

    private var filteredDays: [DayPlan] {
        guard let dayFilter else { return days }
        return days.filter { $0.day == dayFilter }
    }

    private var filteredMapStops: [MapStop] {
        guard let dayFilter else { return mapStops }
        return mapStops.filter { $0.day == dayFilter }
    }

    private var totalStops: Int {
        days.reduce(0) { $0 + $1.items.count }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            header

            if days.count > 1 {
                dayChips
            }

            mapPanel

            if filteredDays.isEmpty {
                emptyState
            } else {
                ForEach(filteredDays, id: \.day) { day in
                    DayPlanBlock(
                        day: day,
                        selectedStopId: $selectedStopId
                    )
                }
            }
        }
        .onChange(of: dayFilter) { _, _ in
            selectedStopId = nil
        }
    }

    private var header: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text(planned ? "Plan" : "Itinerary")
                    .font(TripTheme.serif(28, weight: .regular))
                    .foregroundStyle(TripTheme.ink)
                Text(
                    planned
                        ? "Switch days · tap a stop · map follows."
                        : "Switch days to focus the map. Tap stops or pins."
                )
                .font(.system(size: 14))
                .foregroundStyle(TripTheme.inkMuted)
            }

            Spacer(minLength: 0)

            HStack(spacing: 8) {
                MetaPill(
                    text: durationDays > 0
                        ? (durationDays == 1 ? "1 day" : "\(durationDays) days")
                        : (days.count == 1 ? "1 day" : "\(days.count) days")
                )
                if totalStops > 0 {
                    MetaPill(text: totalStops == 1 ? "1 stop" : "\(totalStops) stops")
                }
                if dayFilter != nil, !filteredMapStops.isEmpty {
                    MetaPill(
                        text: "\(filteredMapStops.count) on map",
                        tone: .sea
                    )
                }
            }
        }
    }

    private var dayChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                DayChip(
                    title: "All days",
                    detail: nil,
                    count: nil,
                    isSelected: dayFilter == nil
                ) {
                    dayFilter = nil
                }

                ForEach(days, id: \.day) { day in
                    let count = day.items.count
                    DayChip(
                        title: "Day \(day.day)",
                        detail: day.date.isEmpty ? nil : Trip.formatDayChipDate(day.date),
                        count: count > 0 ? count : nil,
                        isSelected: dayFilter == day.day
                    ) {
                        dayFilter = day.day
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var mapPanel: some View {
        if !filteredMapStops.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(filteredMapStops.count >= 2 ? "Route" : "Map")
                            .font(TripTheme.serif(18, weight: .regular))
                            .foregroundStyle(TripTheme.ink)
                        Text(mapSubtitle)
                            .font(.system(size: 12))
                            .foregroundStyle(TripTheme.inkMuted)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)

                Divider()
                    .overlay(TripTheme.sand200.opacity(0.7))

                TripMapView(stops: filteredMapStops, selectedStopId: $selectedStopId)
                    .frame(height: 240)
            }
            .background(TripTheme.panelFill, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(TripTheme.sand200.opacity(0.8), lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .shadow(color: TripTheme.ink.opacity(0.04), radius: 16, y: 4)
        }
    }

    private var mapSubtitle: String {
        if let dayFilter {
            let n = filteredMapStops.count
            return "Day \(dayFilter) · \(n) \(n == 1 ? "pin" : "pins")"
        }
        let n = filteredMapStops.count
        if n >= 2 {
            return "\(n) stops · route"
        }
        return filteredMapStops.first?.label ?? "Map"
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Text("No stops yet")
                .font(TripTheme.serif(20, weight: .regular))
                .foregroundStyle(TripTheme.ink)
            Text(
                planned
                    ? "Add days and stops in admin to build the plan."
                    : "No itinerary for this filter."
            )
            .font(.system(size: 14))
            .foregroundStyle(TripTheme.inkMuted)
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 36)
        .padding(.horizontal, 20)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(TripTheme.sand300.opacity(0.9), style: StrokeStyle(lineWidth: 1, dash: [6, 4]))
                .background(
                    TripTheme.panelFill.opacity(0.6),
                    in: RoundedRectangle(cornerRadius: 24, style: .continuous)
                )
        )
    }
}

private struct MetaPill: View {
    enum Tone {
        case neutral
        case sea
    }

    let text: String
    var tone: Tone = .neutral

    var body: some View {
        Text(text)
            .font(.system(size: 12))
            .foregroundStyle(tone == .sea ? TripTheme.sea : TripTheme.inkSoft)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background {
                Capsule()
                    .fill(tone == .sea ? TripTheme.sea.opacity(0.1) : Color.white.opacity(0.8))
            }
            .overlay {
                Capsule()
                    .stroke(
                        tone == .sea ? TripTheme.sea.opacity(0.2) : TripTheme.sand200.opacity(0.9),
                        lineWidth: 1
                    )
            }
    }
}

private struct DayChip: View {
    let title: String
    let detail: String?
    let count: Int?
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(isSelected ? .white : TripTheme.inkSoft)

                if let detail {
                    Text(detail)
                        .font(.system(size: 13))
                        .foregroundStyle(isSelected ? .white.opacity(0.7) : TripTheme.inkMuted)
                }

                if let count {
                    Text("· \(count)")
                        .font(.system(size: 13).monospacedDigit())
                        .foregroundStyle(isSelected ? .white.opacity(0.55) : TripTheme.inkMuted.opacity(0.8))
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background {
                if isSelected {
                    Capsule().fill(TripTheme.ink)
                        .shadow(color: .black.opacity(0.08), radius: 3, y: 1)
                } else {
                    Capsule().fill(Color.white.opacity(0.7))
                }
            }
            .overlay {
                if !isSelected {
                    Capsule()
                        .stroke(TripTheme.sand200.opacity(0.9), lineWidth: 1)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

private struct DayPlanBlock: View {
    let day: DayPlan
    @Binding var selectedStopId: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("Day \(day.day)")
                    .font(.system(size: 12, weight: .semibold))
                    .tracking(0.8)
                    .textCase(.uppercase)
                    .foregroundStyle(TripTheme.sea)
                Text(day.title)
                    .font(TripTheme.serif(18, weight: .regular))
                    .foregroundStyle(TripTheme.ink)
                Spacer(minLength: 0)
                if !day.date.isEmpty {
                    Text(Trip.formatDayChipDate(day.date))
                        .font(.system(size: 12))
                        .foregroundStyle(TripTheme.inkMuted)
                }
                Text("\(day.items.count) \(day.items.count == 1 ? "stop" : "stops")")
                    .font(.system(size: 11))
                    .foregroundStyle(TripTheme.inkMuted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(TripTheme.sand.opacity(0.55))

            VStack(spacing: 0) {
                ForEach(Array(day.items.enumerated()), id: \.element.id) { index, item in
                    if index > 0 {
                        Divider()
                            .overlay(TripTheme.sand100)
                            .padding(.leading, 38)
                    }
                    StopRow(
                        item: item,
                        isSelected: selectedStopId == item.id,
                        isLast: index == day.items.count - 1
                    ) {
                        if item.lat != nil, item.lng != nil {
                            selectedStopId = item.id
                        }
                    }
                }
            }
        }
        .background(TripTheme.panelFill, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(TripTheme.sand200.opacity(0.8), lineWidth: 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct StopRow: View {
    let item: ItineraryItem
    let isSelected: Bool
    let isLast: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(alignment: .top, spacing: 12) {
                VStack(spacing: 0) {
                    Circle()
                        .fill(isSelected ? TripTheme.coral : TripTheme.sea.opacity(0.55))
                        .frame(width: 10, height: 10)
                        .padding(.top, 5)
                    if !isLast {
                        Rectangle()
                            .fill(TripTheme.sand200)
                            .frame(width: 2)
                            .frame(maxHeight: .infinity)
                    }
                }
                .frame(width: 12)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        if let time = item.time, !time.isEmpty {
                            Text(time)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(TripTheme.coral)
                                .monospacedDigit()
                        }
                        Text(item.title)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(TripTheme.ink)
                            .multilineTextAlignment(.leading)
                    }

                    if let location = item.location, !location.isEmpty {
                        Text(location)
                            .font(.subheadline)
                            .foregroundStyle(TripTheme.inkMuted)
                    }

                    if let description = item.description, !description.isEmpty {
                        Text(description)
                            .font(.subheadline)
                            .foregroundStyle(TripTheme.inkSoft.opacity(0.85))
                    }

                    if let category = item.category {
                        Text(category.rawValue)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(TripTheme.sea)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(TripTheme.sea.opacity(0.12), in: Capsule())
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 14)
            .background {
                if isSelected {
                    TripTheme.coral.opacity(0.08)
                }
            }
        }
        .buttonStyle(.plain)
    }
}
