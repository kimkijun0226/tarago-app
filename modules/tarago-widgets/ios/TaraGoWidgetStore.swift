import Foundation

struct TaraGoWidgetTarget: Codable, Equatable {
  let color: String?
  let id: String
  let transport: String
  let title: String
  let stationName: String
  let stationId: String?
  let routeId: String?
  let stationSeq: Int?
  let lineId: String?
  let direction: String?
  let directionLabel: String?
  let destination: String?
  let destinations: [String]?
}

struct TaraGoWidgetConfiguration: Codable, Equatable {
  let apiBaseURL: String
  let items: [TaraGoWidgetTarget]
}

/** 공유 파일에는 선택 대상만 저장하며 기기 인증 자격 증명은 복사하지 않는다. */
enum TaraGoWidgetStore {
  static func fileURL() throws -> URL {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "TaraGoWidgetGroup") as? String,
          let folder = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    else { throw StoreError.groupUnavailable }
    return folder.appendingPathComponent("transit-widget-v1.json")
  }

  static func read() -> TaraGoWidgetConfiguration? {
    guard let url = try? fileURL(), let data = try? Data(contentsOf: url),
          let value = try? JSONDecoder().decode(TaraGoWidgetConfiguration.self, from: data),
          valid(value) else { return nil }
    return value
  }

  static func write(_ value: TaraGoWidgetConfiguration) throws {
    guard valid(value) else { throw StoreError.invalidConfiguration }
    try JSONEncoder().encode(value).write(to: fileURL(), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }

  static func valid(_ value: TaraGoWidgetConfiguration) -> Bool {
    guard let base = URLComponents(string: value.apiBaseURL),
          let host = base.host, base.user == nil, base.password == nil,
          base.query == nil, base.fragment == nil,
          value.items.count <= 12,
          Set(value.items.map(\.id)).count == value.items.count else { return false }
    let origins = Bundle.main.object(forInfoDictionaryKey: "TaraGoWidgetAPIOrigins") as? [String] ?? []
    let allowed = origins.compactMap { URLComponents(string: $0) }
      .contains { $0.scheme == base.scheme && $0.host == host && $0.port == base.port }
    #if DEBUG
    let local = base.scheme == "http" && (host == "localhost" || host == "127.0.0.1" || privateHost(host))
    #else
    let local = false
    #endif
    guard (base.scheme == "https" && allowed) || local else { return false }
    return value.items.allSatisfy { item in
      if let color = item.color, color.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) == nil { return false }
      guard !item.id.isEmpty, !item.title.isEmpty, !item.stationName.isEmpty else { return false }
      if item.transport == "bus" { return item.stationId?.isEmpty == false && item.routeId?.isEmpty == false }
      return item.transport == "subway" && item.lineId?.isEmpty == false && item.direction != nil
    }
  }

  private static func privateHost(_ host: String) -> Bool {
    let parts = host.split(separator: ".").compactMap { Int($0) }
    return parts.count == 4 && parts.allSatisfy { (0...255).contains($0) } &&
      (parts[0] == 10 || (parts[0] == 192 && parts[1] == 168) || (parts[0] == 172 && (16...31).contains(parts[1])))
  }
  enum StoreError: Error { case groupUnavailable, invalidConfiguration }
}
