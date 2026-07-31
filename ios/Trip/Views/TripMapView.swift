import MapKit
import SwiftUI

/// A map stop with a stable id for list ↔ pin selection sync.
struct MapStop: Identifiable, Hashable {
    var id: String
    var coordinate: CLLocationCoordinate2D
    var label: String
    var day: Int?
    var category: StopCategory?

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: MapStop, rhs: MapStop) -> Bool {
        lhs.id == rhs.id
    }
}

extension Trip {
    /// Prefer explicit `location.stops`; fall back to itinerary items with coords.
    var mapStops: [MapStop] {
        if let stops = location?.stops, !stops.isEmpty {
            return stops.enumerated().map { index, stop in
                MapStop(
                    id: stop.id ?? stop.itemId ?? "stop-\(index)",
                    coordinate: CLLocationCoordinate2D(latitude: stop.lat, longitude: stop.lng),
                    label: stop.label,
                    day: stop.day,
                    category: stop.category
                )
            }
        }

        var result: [MapStop] = []
        for day in days {
            for item in day.items {
                guard let lat = item.lat, let lng = item.lng else { continue }
                result.append(
                    MapStop(
                        id: item.id,
                        coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lng),
                        label: item.title,
                        day: day.day,
                        category: item.category
                    )
                )
            }
        }
        return result
    }
}

struct TripMapView: View {
    let stops: [MapStop]
    @Binding var selectedStopId: String?

    @State private var cameraPosition: MapCameraPosition = .automatic

    var body: some View {
        Map(position: $cameraPosition, selection: $selectedStopId) {
            ForEach(stops) { stop in
                Annotation(stop.label, coordinate: stop.coordinate, anchor: .bottom) {
                    MapPinMark(
                        category: stop.category,
                        isSelected: selectedStopId == stop.id
                    )
                    .onTapGesture {
                        selectedStopId = stop.id
                    }
                }
                .tag(stop.id)
            }

            if stops.count >= 2 {
                MapPolyline(coordinates: stops.map(\.coordinate))
                    .stroke(TripTheme.sea.opacity(0.55), lineWidth: 3)
            }
        }
        .mapStyle(.standard(elevation: .realistic))
        .onChange(of: selectedStopId) { _, newValue in
            focusCamera(on: newValue)
        }
        .onAppear {
            if selectedStopId == nil {
                cameraPosition = .automatic
            } else {
                focusCamera(on: selectedStopId)
            }
        }
    }

    /// Recenter when the selected stop changes.
    private func focusCamera(on stopId: String?) {
        guard let stopId,
              let stop = stops.first(where: { $0.id == stopId })
        else {
            return
        }
        let span = Self.selectionSpan
        cameraPosition = .region(
            MKCoordinateRegion(center: stop.coordinate, span: span)
        )
    }

    /// Span used when focusing a selected stop.
    ///
    /// Trade-off: ~0.02 feels street-level; ~0.15 keeps multi-stop route context.
    /// Tweak these two numbers to set the product feel.
    /// Street-level focus so a selected stop is easy to read.
    private static let selectionSpan = MKCoordinateSpan(
        latitudeDelta: 0.02,
        longitudeDelta: 0.02
    )
}

private struct MapPinMark: View {
    let category: StopCategory?
    let isSelected: Bool

    var body: some View {
        Image(systemName: iconName)
            .font(.system(size: isSelected ? 16 : 13, weight: .semibold))
            .foregroundStyle(.white)
            .padding(isSelected ? 10 : 8)
            .background(pinColor, in: Circle())
            .overlay {
                Circle()
                    .stroke(.white, lineWidth: isSelected ? 2.5 : 1)
            }
            .shadow(color: .black.opacity(0.2), radius: isSelected ? 6 : 3, y: 2)
            .scaleEffect(isSelected ? 1.12 : 1)
            .animation(.spring(duration: 0.28), value: isSelected)
    }

    private var pinColor: Color {
        switch category {
        case .food: TripTheme.coral
        case .stay: TripTheme.sea
        case .sight: Color(red: 0.45, green: 0.55, blue: 0.35)
        case .activity: Color(red: 0.55, green: 0.40, blue: 0.65)
        case .transport: Color(red: 0.35, green: 0.45, blue: 0.60)
        case .shop: Color(red: 0.70, green: 0.50, blue: 0.30)
        case .other, .none: TripTheme.ink.opacity(0.75)
        }
    }

    private var iconName: String {
        switch category {
        case .food: "fork.knife"
        case .stay: "bed.double.fill"
        case .sight: "binoculars.fill"
        case .activity: "figure.walk"
        case .transport: "car.fill"
        case .shop: "bag.fill"
        case .other, .none: "mappin"
        }
    }
}
