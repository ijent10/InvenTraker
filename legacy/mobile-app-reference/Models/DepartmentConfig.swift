import Foundation

struct DepartmentConfig: Codable, Identifiable, Hashable {
    var id: UUID
    var name: String
    var locations: [String]
    
    init(id: UUID = UUID(), name: String, locations: [String] = []) {
        self.id = id
        self.name = name
        self.locations = locations
    }
}
