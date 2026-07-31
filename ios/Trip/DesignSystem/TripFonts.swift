import SwiftUI
import UIKit

extension TripTheme {
    /// Polaroid paper face (#fffcf7)
    static let polaroidPaper = Color(red: 1.0, green: 0.988, blue: 0.969)
    /// Handwritten caption ink
    static let polaroidInk = Color(red: 0.173, green: 0.149, blue: 0.125) // #2c2620
    /// Meta line under caption
    static let polaroidMeta = Color(red: 0.384, green: 0.353, blue: 0.318) // #625a51
    /// Cork base under the tile
    static let corkBase = Color(red: 0.788, green: 0.659, blue: 0.478) // #c9a87a

    /// Handwriting for polaroid titles (Caveat-like on iOS).
    static func hand(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
        if UIFont(name: "Noteworthy-Bold", size: size) != nil {
            return .custom("Noteworthy-Bold", size: size)
        }
        if UIFont(name: "Bradley Hand", size: size) != nil {
            return .custom("Bradley Hand", size: size)
        }
        return .system(size: size, weight: weight, design: .rounded)
    }

    static func serif(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }
}
