import SwiftUI
import UIKit

extension Color {
    init(hex: String) {
        let normalized = hex.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
        guard normalized.count == 6, let value = UInt64(normalized, radix: 16) else {
            self = .blue
            return
        }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }

    var hexString: String {
        let color = UIColor(self)
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        guard color.getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return "#2563EB" }
        return String(format: "#%02X%02X%02X", Int(red * 255), Int(green * 255), Int(blue * 255))
    }
}

/// Shared IDS semantics. Explicit organization and personal theme colors take precedence.
enum IDS {
    enum Radius {
        static let small: CGFloat = 10
        static let medium: CGFloat = 14
        static let large: CGFloat = 20
        static let extraLarge: CGFloat = 28
    }

    enum Spacing {
        static let compact: CGFloat = 8
        static let standard: CGFloat = 16
        static let section: CGFloat = 24
    }

    enum Motion {
        static let immediate = 0.1
        static let standard = 0.22
        static let panel = 0.3
    }

    private static func adaptive(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            let value = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((value >> 16) & 255) / 255,
                           green: CGFloat((value >> 8) & 255) / 255,
                           blue: CGFloat(value & 255) / 255, alpha: 1)
        })
    }

    static let background = adaptive(light: 0xF5F5F7, dark: 0x101012)
    static let surface = adaptive(light: 0xFFFFFF, dark: 0x1C1C1E)
    static let secondarySurface = adaptive(light: 0xF0F0F2, dark: 0x2C2C2E)
    static let text = adaptive(light: 0x1D1D1F, dark: 0xF5F5F7)
    static let secondaryText = adaptive(light: 0x6E6E73, dark: 0xAEAEB2)
    static let tertiaryText = adaptive(light: 0x86868B, dark: 0x8E8E93)
    static let accent = adaptive(light: 0x007AFF, dark: 0x0A84FF)
    static let success = adaptive(light: 0x248A3D, dark: 0x30D158)
    static let warning = adaptive(light: 0xB86E00, dark: 0xFF9F0A)
    static let critical = adaptive(light: 0xD92D20, dark: 0xFF453A)
    static let separator = Color(uiColor: .separator)
}

extension MobileTheme {
    var accentColor: Color { Color(hex: accent) }
    var secondaryColor: Color { Color(hex: secondary) }
    var backgroundColor: Color { background.map { Color(hex: $0) } ?? IDS.background }
    var backgroundSoftColor: Color { backgroundSoft.map { Color(hex: $0) } ?? IDS.secondarySurface }
    var panelColor: Color { panel.map { Color(hex: $0) } ?? IDS.surface }
    var panelStrongColor: Color { (panelStrong ?? panel).map { Color(hex: $0) } ?? IDS.surface }
    var controlBackgroundColor: Color { (controlBg ?? panel).map { Color(hex: $0) } ?? IDS.surface }
    var controlHoverColor: Color { controlHover.map { Color(hex: $0) } ?? IDS.secondarySurface }
    var controlBorderColor: Color { controlBorder.map { Color(hex: $0) } ?? IDS.separator }
    var textColor: Color { text.map { Color(hex: $0) } ?? IDS.text }
    var mutedColor: Color { muted.map { Color(hex: $0) } ?? IDS.secondaryText }
    var subtleColor: Color { subtle.map { Color(hex: $0) } ?? IDS.tertiaryText }
    var buttonTextColor: Color { Color(hex: buttonText ?? "#ffffff") }

    var preferredColorScheme: ColorScheme? {
        switch mode {
        case "Light": .light
        case "Dark": .dark
        default: nil
        }
    }
}

enum AppTheme {
    static let navy = Color(red: 0.06, green: 0.13, blue: 0.29)
    static let accent = Color(red: 0.14, green: 0.33, blue: 0.72)
    static let mint = Color(red: 0.08, green: 0.58, blue: 0.51)
    static let amber = IDS.warning
    static let danger = IDS.critical
}

struct BrandMark: View {
    var size: CGFloat = 58

    var body: some View {
        Image("BrandLogo")
            .resizable()
            .scaledToFit()
            .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct SurfaceModifier: ViewModifier {
    @EnvironmentObject private var session: AppSession

    func body(content: Content) -> some View {
        content
            .background(session.theme.panelColor, in: RoundedRectangle(cornerRadius: IDS.Radius.large, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: IDS.Radius.large, style: .continuous)
                    .stroke(session.theme.controlBorderColor, lineWidth: 1)
            }
    }
}

extension View {
    func appSurface() -> some View { modifier(SurfaceModifier()) }
}
