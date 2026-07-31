import Foundation

/// Remembers the friend's display name across uploads and notes.
enum UploaderIdentity {
    private static let key = "trip.uploaderName"

    static var name: String {
        get { UserDefaults.standard.string(forKey: key) ?? "" }
        set {
            let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
            UserDefaults.standard.set(trimmed, forKey: key)
        }
    }
}
