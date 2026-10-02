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

extension MobileTheme {
    var accentColor: Color { Color(hex: accent) }
    var secondaryColor: Color { Color(hex: secondary) }
    var backgroundColor: Color { Color(hex: background ?? (mode == "Light" ? "#f8fafc" : "#020617")) }
    var backgroundSoftColor: Color { Color(hex: backgroundSoft ?? (mode == "Light" ? "#eff6ff" : "#0f172a")) }
    var panelColor: Color { Color(hex: panel ?? (mode == "Light" ? "#ffffff" : "#0f172a")) }
    var panelStrongColor: Color { Color(hex: panelStrong ?? panel ?? (mode == "Light" ? "#ffffff" : "#111827")) }
    var controlBackgroundColor: Color { Color(hex: controlBg ?? panel ?? (mode == "Light" ? "#ffffff" : "#020617")) }
    var controlHoverColor: Color { Color(hex: controlHover ?? (mode == "Light" ? "#eff6ff" : "#172033")) }
    var controlBorderColor: Color { Color(hex: controlBorder ?? (mode == "Light" ? "#cbd5e1" : "#334155")) }
    var textColor: Color { Color(hex: text ?? (mode == "Light" ? "#0f172a" : "#f8fafc")) }
    var mutedColor: Color { Color(hex: muted ?? (mode == "Light" ? "#475569" : "#94a3b8")) }
    var subtleColor: Color { Color(hex: subtle ?? (mode == "Light" ? "#64748b" : "#64748b")) }
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
    static let amber = Color(red: 0.91, green: 0.57, blue: 0.12)
    static let danger = Color(red: 0.82, green: 0.20, blue: 0.24)
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
            .background(session.theme.panelColor, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(session.theme.controlBorderColor, lineWidth: 1)
            }
    }
}

extension View {
    func appSurface() -> some View { modifier(SurfaceModifier()) }
}
