import SwiftUI
import WidgetKit
import AppIntents

@available(iOS 17.0, *)
struct RefreshTransitWidget: AppIntent {
  static var title: LocalizedStringResource = "도착정보 새로고침"
  static var openAppWhenRun = false
  func perform() async throws -> some IntentResult {
    WidgetCenter.shared.reloadTimelines(ofKind: "TaraGoTransit")
    return .result()
  }
}

struct TransitWidgetRow: Identifiable {
  let target: TaraGoWidgetTarget
  var id: String { target.id }
  let direction: String
  let arrivalAt: Date?
  let fetchedAt: Date
  let qualifier: String
  let message: String
}

struct TransitWidgetEntry: TimelineEntry {
  let date: Date
  let rows: [TransitWidgetRow]
  let expired: Bool
  let configured: Bool
}

private struct BusArrival: Decodable {
  let routeId: String
  let stationSeq: Int?
  let direction: String?
  let nextStopName: String?
  let etaSeconds: Double?
  let etaPrecision: String?
  let etaSource: String?
  let serviceStatus: String?
}
private struct SubwayArrival: Decodable {
  let lineId: String
  let direction: String
  let destination: String
  let arrivalCode: String
  let etaSeconds: Double?
  let etaSource: String?
}
private struct SubwayResponse: Decodable {
  let fetchedAt: String
  let arrivals: [SubwayArrival]
}

/** 앱 프로세스와 독립적으로 기존 공개 도착 API를 조회한다. */
struct TransitWidgetProvider: TimelineProvider {
  func placeholder(in context: Context) -> TransitWidgetEntry {
    TransitWidgetEntry(date: Date(), rows: [], expired: false, configured: false)
  }

  func getSnapshot(in context: Context, completion: @escaping (TransitWidgetEntry) -> Void) {
    if context.isPreview { completion(placeholder(in: context)); return }
    load(completion: completion)
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TransitWidgetEntry>) -> Void) {
    load { entry in
      var entries = [entry]
      // 다음 네트워크 갱신이 지연되어도 오래된 ETA를 현재 도착시간으로 표시하지 않는다.
      for offset in [30.0, 60.0, 90.0] {
        entries.append(TransitWidgetEntry(date: entry.date.addingTimeInterval(offset), rows: entry.rows,
          expired: offset >= 90, configured: entry.configured))
      }
      completion(Timeline(entries: entries, policy: .after(entry.date.addingTimeInterval(90))))
    }
  }

  private func load(completion: @escaping (TransitWidgetEntry) -> Void) {
    guard let configuration = TaraGoWidgetStore.read(), !configuration.items.isEmpty else {
      completion(TransitWidgetEntry(date: Date(), rows: [], expired: false, configured: false)); return
    }
    Task {
      let rows = await withTaskGroup(of: (Int, TransitWidgetRow).self) { group in
        for (index, target) in configuration.items.enumerated() {
          group.addTask { (index, await fetch(target, base: configuration.apiBaseURL)) }
        }
        var results: [(Int, TransitWidgetRow)] = []
        for await result in group { results.append(result) }
        return results.sorted { $0.0 < $1.0 }.map(\.1)
      }
      // 선택 도중에 완료된 이전 요청으로 삭제한 노선이 다시 나타나지 않게 한다.
      let unchanged = TaraGoWidgetStore.read() == configuration
      completion(TransitWidgetEntry(date: Date(), rows: unchanged ? rows : [], expired: false, configured: true))
    }
  }

  private func fetch(_ target: TaraGoWidgetTarget, base: String) async -> TransitWidgetRow {
    let now = Date()
    let fallback = target.directionLabel ?? "방면 정보 없음"
    func row(_ direction: String = "", _ eta: Double? = nil, _ qualifier: String = "", _ message: String = "운행정보 없음", _ fetched: Date = Date()) -> TransitWidgetRow {
      TransitWidgetRow(target: target, direction: direction.isEmpty ? fallback : direction,
        arrivalAt: eta.map { fetched.addingTimeInterval($0) }, fetchedAt: fetched, qualifier: qualifier, message: message)
    }
    do {
      guard var url = URLComponents(string: base) else { return row() }
      if target.transport == "bus" {
        url.path = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/bus/stations/\(target.stationId ?? "")/arrivals"
        if !url.path.hasPrefix("/") { url.path = "/" + url.path }
      } else {
        url.path = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/subway/alert-arrivals"
        if !url.path.hasPrefix("/") { url.path = "/" + url.path }
        url.queryItems = [URLQueryItem(name: "stationName", value: target.stationName),
          URLQueryItem(name: "lineId", value: target.lineId), URLQueryItem(name: "direction", value: target.direction)]
        if let destinations = target.destinations {
          url.queryItems?.append(URLQueryItem(name: "destinations", value: String(data: try JSONEncoder().encode(destinations), encoding: .utf8)))
        } else if let destination = target.destination {
          url.queryItems?.append(URLQueryItem(name: "destination", value: destination))
        }
      }
      guard let endpoint = url.url else { return row() }
      var request = URLRequest(url: endpoint, timeoutInterval: 12)
      request.cachePolicy = .reloadIgnoringLocalCacheData
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
        return row("", nil, "", "조회 실패 · 앱에서 확인")
      }
      let received = Date()
      if target.transport == "bus" {
        let buses = try JSONDecoder().decode([BusArrival].self, from: data).filter {
          $0.routeId == target.routeId && (target.stationSeq == nil || $0.stationSeq == target.stationSeq)
        }.sorted { ($0.etaSeconds ?? .infinity) < ($1.etaSeconds ?? .infinity) }
        guard let first = buses.first else { return row() }
        let direction = first.direction.flatMap { $0.isEmpty ? nil : $0 }
          ?? first.nextStopName.map { "\($0) 방면" } ?? "방면 정보 없음"
        let qualifier = first.etaSource == "turnaround_estimate" ? "예상 약 " : first.etaPrecision == "minutes" ? "약 " : ""
        return row(direction, first.etaSeconds.flatMap { $0.isFinite && $0 >= 0 ? $0 : nil }, qualifier,
          first.serviceStatus == "turnaround_waiting" ? "회차지 대기 중" : "운행정보 확인 중", received)
      }
      let result = try JSONDecoder().decode(SubwayResponse.self, from: data)
      let formatter = ISO8601DateFormatter()
      formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
      let fetched = formatter.date(from: result.fetchedAt) ?? ISO8601DateFormatter().date(from: result.fetchedAt)
      guard let fetched, received.timeIntervalSince(fetched) < 90, fetched.timeIntervalSince(received) < 30 else {
        return row("", nil, "", "최신 정보 확인 필요")
      }
      let destinations = target.destinations ?? target.destination.map { [$0] }
      func normalized(_ name: String) -> String {
        name.replacingOccurrences(of: "\\([^)]*\\)", with: "", options: .regularExpression)
          .trimmingCharacters(in: .whitespacesAndNewlines)
          .replacingOccurrences(of: "행$", with: "", options: .regularExpression)
          .replacingOccurrences(of: "역$", with: "", options: .regularExpression)
          .trimmingCharacters(in: .whitespacesAndNewlines)
      }
      let trains = result.arrivals.filter { train in
        train.lineId == target.lineId && (target.direction == "all" || train.direction == target.direction) &&
          train.arrivalCode != "2" && (["0", "1"].contains(train.arrivalCode) || train.etaSeconds.map { $0.isFinite && $0 >= 0 } == true) &&
          (destinations == nil || destinations!.contains { normalized($0) == normalized(train.destination) })
      }.sorted {
        let left = ["0", "1"].contains($0.arrivalCode) ? 0 : $0.etaSeconds ?? .infinity
        let right = ["0", "1"].contains($1.arrivalCode) ? 0 : $1.etaSeconds ?? .infinity
        return left < right
      }
      guard let first = trains.first else { return row() }
      let destination = first.destination.hasSuffix("행") ? first.destination : "\(first.destination)행"
      let direction = target.direction == "all" || target.directionLabel?.isEmpty != false ? destination : "\(target.directionLabel!) · \(destination)"
      if first.arrivalCode == "0" { return row(direction, nil, "", "진입 중", fetched) }
      if first.arrivalCode == "1" { return row(direction, nil, "", "도착", fetched) }
      return row(direction, first.etaSeconds, first.etaSource == "schedule" ? "시간표 " : first.etaSource == "estimated" ? "예상 " : "", "운행정보 없음", fetched)
    } catch {
      return row("", nil, "", "연결 확인 필요", now)
    }
  }
}

private struct TransitWidgetView: View {
  let entry: TransitWidgetEntry
  @Environment(\.widgetFamily) private var family
  private let accent = Color(red: 0.14, green: 0.41, blue: 0.83)
  private let ink = Color(red: 0.11, green: 0.18, blue: 0.28)
  private var compact: Bool { family == .systemSmall }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 4) {
        Text("TaraGo").font(.system(size: 10, weight: .medium)).foregroundStyle(accent)
        Spacer(minLength: 0)
        if let date = entry.rows.map(\.fetchedAt).min() {
          Text(date, style: .time).font(.system(size: 8, weight: .regular)).foregroundStyle(.secondary)
        }
        if #available(iOS 17.0, *) {
          Button(intent: RefreshTransitWidget()) {
            Image(systemName: "arrow.clockwise").font(.system(size: 10, weight: .regular)).foregroundStyle(accent)
          }.buttonStyle(.plain).accessibilityLabel("도착정보 새로고침")
        }
      }
      if entry.rows.isEmpty {
        Spacer(minLength: 0)
        Text("+").font(.system(size: 24, weight: .ultraLight)).foregroundStyle(accent)
          .frame(maxWidth: .infinity).accessibilityLabel("버스 또는 지하철 추가")
        Spacer(minLength: 0)
      } else {
        ForEach(0..<3, id: \.self) { index in
          HStack(spacing: 10) {
            cell(index)
            if !compact {
              Rectangle().fill(Color.gray.opacity(0.16)).frame(width: 0.5, height: 22)
              cell(index + 3)
            }
          }.frame(maxHeight: .infinity)
          if index < 2 { Divider().opacity(0.55) }
        }
      }
    }
    .foregroundStyle(ink)
    .widgetURL(URL(string: "tarago:///widgets"))
    .modifier(WidgetBackground())
  }

  @ViewBuilder private func cell(_ index: Int) -> some View {
    if index < entry.rows.count {
      let row = entry.rows[index]
      HStack(spacing: 4) {
        Text(row.target.title).font(.system(size: 10, weight: .medium))
          .lineLimit(1).minimumScaleFactor(0.75).frame(width: 35, alignment: .leading)
        Text(row.direction.replacingOccurrences(of: " 방면", with: "").replacingOccurrences(of: " 정보 없음", with: ""))
          .font(.system(size: 9, weight: .regular)).lineLimit(1)
          .frame(maxWidth: .infinity, alignment: .leading)
        arrival(row).font(.system(size: 11, weight: .medium)).monospacedDigit()
          .foregroundStyle(accent).lineLimit(1).minimumScaleFactor(0.7)
          .frame(width: 38, alignment: .trailing)
      }.frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityHint(row.target.stationName)
    } else {
      Text("—").font(.system(size: 10, weight: .ultraLight)).foregroundStyle(.tertiary)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func arrival(_ row: TransitWidgetRow) -> Text {
    if entry.expired || entry.date.timeIntervalSince(row.fetchedAt) >= 90 { return Text("갱신") }
    guard let arrivalAt = row.arrivalAt else {
      if row.message.contains("실패") || row.message.contains("연결") { return Text("재조회") }
      if row.message.contains("최신") { return Text("갱신") }
      if row.message.contains("대기") { return Text("대기") }
      if row.message == "진입 중" { return Text("진입") }
      if row.message == "도착" { return Text("도착") }
      return Text("—")
    }
    let seconds = arrivalAt.timeIntervalSince(entry.date)
    if seconds < -15 { return Text("갱신") }
    if seconds <= 60 { return Text("곧 도착") }
    let prefix = row.qualifier.isEmpty ? "" : "약 "
    return Text("\(prefix)\(Int(ceil(seconds / 60)))분")
  }
}
private struct WidgetBackground: ViewModifier {
  @ViewBuilder func body(content: Content) -> some View {
    if #available(iOS 17.0, *) { content.containerBackground(.white, for: .widget) }
    else { content.padding(16).background(Color.white) }
  }
}

@main
struct TaraGoTransitWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "TaraGoTransit", provider: TransitWidgetProvider()) { entry in
      TransitWidgetView(entry: entry)
    }
    .configurationDisplayName("TaraGo 도착정보")
    .description("버스·지하철 도착정보를 작은 위젯은 3개, 가로 위젯은 6개 표시해요.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
