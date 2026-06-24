import SwiftUI

struct QuickStartTutorialView: View {
    @EnvironmentObject private var session: AccountSessionStore
    @StateObject private var settings = AppSettings.shared
    @State private var pageIndex = 0

    private let pages: [TutorialPage] = [
        TutorialPage(
            symbol: "shippingbox.fill",
            title: "Welcome to InvenTraker",
            message: "You are signed in and almost ready. This quick walkthrough shows the core daily flow.",
            bulletPoints: [
                "Takes less than a minute.",
                "You can skip anytime."
            ]
        ),
        TutorialPage(
            symbol: "barcode.viewfinder",
            title: "Scan-First Workflow",
            message: "Use barcode scanning across Received, Spot Check, Expiration, and Waste for fast updates.",
            bulletPoints: [
                "Unknown UPCs can pull from catalog records with photos.",
                "You can always switch to manual entry."
            ]
        ),
        TutorialPage(
            symbol: "shippingbox.and.arrow.triangle.2.circlepath",
            title: "Catalog Layers",
            message: "Product data now flows through three layers: central catalog, company catalog, then store overrides.",
            bulletPoints: [
                "Central: UPC + item name + product photo.",
                "Company: tags, price, case pack, default expiry, vendor, department, unit, prepack settings.",
                "Store: minimum quantity overrides."
            ]
        ),
        TutorialPage(
            symbol: "scissors",
            title: "Prepack Chop Flow",
            message: "Chop now only shows items marked as prepackaged and records package-level data.",
            bulletPoints: [
                "Enter or scan package barcode.",
                "Capture package weight and expiration.",
                "For rewrapped items, package price can auto-calculate from weight (or use manual pricing from Settings).",
                "Source inventory is reduced automatically.",
                "Spot Check can scan wrapped barcodes and prefill quantity + expiration."
            ]
        ),
        TutorialPage(
            symbol: "flame.fill",
            title: "Production + How-To Library",
            message: "Production is local-first and works offline. Morning spot checks drive trend-based make suggestions.",
            bulletPoints: [
                "Define products with ingredient formulas and target yield.",
                "How-To guides are searchable company-wide and cached locally.",
                "Mark production complete to add finished inventory with default expiration and optional barcode."
            ]
        ),
        TutorialPage(
            symbol: "cart.fill",
            title: "Generate and Receive Orders",
            message: "Generate orders by truck, adjust quantities, complete, then receive against those lines.",
            bulletPoints: [
                "Upcoming deliveries are included in recommendations.",
                "Receiving moves orders into past history automatically."
            ]
        ),
        TutorialPage(
            symbol: "star.circle.fill",
            title: "Customize Your Quick Action",
            message: "In Home > Rearrange Sections, star one module to control the center action button.",
            bulletPoints: [
                "Only one action can be starred at a time.",
                "The center button icon updates to match your chosen module."
            ]
        ),
        TutorialPage(
            symbol: "person.2.fill",
            title: "Roles and Permissions",
            message: "Owners control invites, roles, and custom module/action permissions for staff.",
            bulletPoints: [
                "Account tab shows your access in real time.",
                "Audit logs capture operational actions."
            ]
        )
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                TabView(selection: $pageIndex) {
                    ForEach(Array(pages.enumerated()), id: \.offset) { index, page in
                        TutorialPageView(page: page, accentColor: settings.accentColor)
                            .tag(index)
                            .padding(.horizontal, 20)
                            .padding(.top, 10)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .always))
                .animation(.easeInOut(duration: 0.2), value: pageIndex)

                HStack(spacing: 10) {
                    Button("Skip") {
                        session.completeTutorial()
                    }
                    .buttonStyle(.bordered)

                    Spacer()

                    if pageIndex < pages.count - 1 {
                        Button {
                            withAnimation {
                                pageIndex += 1
                            }
                        } label: {
                            Label("Next", systemImage: "chevron.right")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(settings.accentColor)
                    } else {
                        Button("Get Started") {
                            session.completeTutorial()
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(settings.accentColor)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 18)
            }
            .navigationTitle("Quick Tutorial")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct TutorialPage {
    let symbol: String
    let title: String
    let message: String
    let bulletPoints: [String]
}

private struct TutorialPageView: View {
    let page: TutorialPage
    let accentColor: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                Image(systemName: page.symbol)
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(accentColor)
                    .frame(width: 48, height: 48)
                    .background(accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))

                Text(page.title)
                    .font(.title3.weight(.bold))
            }

            Text(page.message)
                .font(.body)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 10) {
                ForEach(page.bulletPoints, id: \.self) { point in
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.caption)
                            .foregroundStyle(accentColor)
                            .padding(.top, 3)
                        Text(point)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer(minLength: 0)
        }
        .padding(18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
