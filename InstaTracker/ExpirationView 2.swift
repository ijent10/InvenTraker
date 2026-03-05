import SwiftUI
import Observation

// ... unchanged code above ...

struct ExpiringItemRow: View {
    @Bindable var item: InventoryItem
    let batch: Batch
    let daysUntil: Int
    @StateObject private var settings = AppSettings.shared
    
    var urgencyColor: Color {
        switch daysUntil {
        case 0...2: return .red
        case 3...5: return .orange
        default: return .yellow
        }
    }
    
    var suggestedSale: Int {
        switch daysUntil {
        case 0...1: return 50
        case 2...3: return 30
        case 4...5: return 20
        default: return 10
        }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                CachedThumbnailView(
                    imageData: item.pictures.first,
                    cacheKey: "expiration-row-\(item.id.uuidString)-\(item.pictures.first?.count ?? 0)",
                    width: 60,
                    height: 60,
                    cornerRadius: 10
                )
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.name)
                        .font(.headline)
                    
                    HStack(spacing: 4) {
                        Image(systemName: "clock.fill")
                            .font(.caption)
                        
                        Text(daysUntil == 0 ? "Expires today" :
                             daysUntil == 1 ? "Expires tomorrow" :
                             "Expires in \(daysUntil) days")
                    }
                    .font(.subheadline)
                    .foregroundStyle(urgencyColor)
                    
                    Text("\(batch.quantity.formattedQuantity()) \(item.unit.rawValue)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                
                Spacer()
            }
            
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: "sparkles")
                        .foregroundStyle(.orange)
                    Text("Suggested Sale:")
                        .font(.subheadline)
                        .fontWeight(.medium)
                    Spacer()
                    Text("\(item.salePercentage == 0 ? suggestedSale : item.salePercentage)%")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.orange)
                    Stepper("\(item.salePercentage == 0 ? suggestedSale : item.salePercentage)%",
                            value: $item.salePercentage,
                            in: 5...90, step: 5)
                        .labelsHidden()
                }
                
                Toggle("Mark as On Sale", isOn: $item.isOnSale)
                    .tint(.orange)
                    .padding(.top, 4)
            }
            .padding()
            .background(.orange.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .padding(.vertical, 8)
    }
}
