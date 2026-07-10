import SwiftUI

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
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.23, style: .continuous)
                .fill(AppTheme.navy)
            Image(systemName: "shippingbox.fill")
                .font(.system(size: size * 0.48, weight: .semibold))
                .foregroundStyle(.white)
            Image(systemName: "checkmark")
                .font(.system(size: size * 0.22, weight: .black))
                .foregroundStyle(AppTheme.mint)
                .offset(x: size * 0.18, y: -size * 0.17)
        }
        .frame(width: size, height: size)
        .shadow(color: AppTheme.navy.opacity(0.18), radius: 16, y: 8)
    }
}

struct SurfaceModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.primary.opacity(0.08), lineWidth: 1)
            }
    }
}

extension View {
    func appSurface() -> some View { modifier(SurfaceModifier()) }
}
