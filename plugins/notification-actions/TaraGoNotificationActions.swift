// Expo's ordinary notification handling stays with its existing delegate.
private final class TaraGoNotificationActions: NSObject, UNUserNotificationCenterDelegate {
  private static var retained: TaraGoNotificationActions?
  private let original: UNUserNotificationCenterDelegate
  private var active = Set<String>()
  private let service = "com.anonymous.tarago.notification-actions"
  private struct Job: Codable {
    let token: String
    let action: String
    let expiresAt: String
    let notificationId: String
    var key: String { token + ":" + action }
  }

  private init(original: UNUserNotificationCenterDelegate) {
    self.original = original
    super.init()
  }

  static func install() {
    guard retained == nil else { return }
    let center = UNUserNotificationCenter.current()
    let expoDelegate = NotificationCenterManager.shared
    let handler = TaraGoNotificationActions(original: center.delegate ?? expoDelegate)
    retained = handler
    center.delegate = handler
    let category = UNNotificationCategory(identifier: "taragoArrival", actions: [
      UNNotificationAction(identifier: "TARAGO_RIDE_DONE", title: "탔어요 · 오늘은 그만", options: []),
      UNNotificationAction(identifier: "TARAGO_SNOOZE_FIVE", title: "5분 뒤 다시 알림", options: [])
    ], intentIdentifiers: [], options: [])
    center.getNotificationCategories { categories in
      center.setNotificationCategories(Set(categories.filter { $0.identifier != category.identifier }).union([category]))
    }
    NotificationCenter.default.addObserver(handler, selector: #selector(handler.resume), name: UIApplication.didBecomeActiveNotification, object: nil)
    handler.resume()
  }

  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    if original.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:))) {
      original.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
    } else { completionHandler([]) }
  }

  func userNotificationCenter(_ center: UNUserNotificationCenter, openSettingsFor notification: UNNotification?) {
    original.userNotificationCenter?(center, openSettingsFor: notification)
  }

  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
    let action: String
    switch response.actionIdentifier {
    case "TARAGO_RIDE_DONE": action = "rideDone"
    case "TARAGO_SNOOZE_FIVE": action = "snoozeFive"
    default:
      if original.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:))) {
        original.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
      } else { completionHandler() }
      return
    }
    let data = response.notification.request.content.userInfo
    // Expo/APNs wraps custom push data inside `body` on iOS.
    let payload = data["body"] as? [AnyHashable: Any] ?? data
    guard let token = payload["actionToken"] as? String, token.count <= 2048,
          let expiresAt = payload["actionExpiresAt"] as? String else { completionHandler(); return }
    let job = Job(token: token, action: action, expiresAt: expiresAt, notificationId: response.notification.request.identifier)
    DispatchQueue.main.async {
      do {
        var jobs = try self.readJobs()
        if !jobs.contains(where: { $0.key == job.key }) { jobs.append(job) }
        try self.saveJobs(jobs)
        self.send(job) {
          // Let Expo update an already-running UI after the native request finishes.
          self.original.userNotificationCenter?(center, didReceive: response, withCompletionHandler: {})
          completionHandler()
        }
      } catch {
        self.reportFailure()
        completionHandler()
      }
    }
  }

  @objc private func resume() {
    DispatchQueue.main.async {
      do { for job in try self.readJobs() { self.send(job, completion: {}) } }
      catch { self.reportFailure() }
    }
  }

  private func endpoint() -> URL? {
#if DEBUG
    guard let bundle = RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry"),
          var parts = URLComponents(url: bundle, resolvingAgainstBaseURL: false) else { return nil }
    parts.port = 3000
    parts.path = "/alerts/actions"
    parts.query = nil
    parts.fragment = nil
    return parts.url
#else
    guard let origin = Bundle.main.object(forInfoDictionaryKey: "TaraGoNotificationAPIOrigin") as? String,
          var parts = URLComponents(string: origin), parts.scheme == "https", parts.host != nil else { return nil }
    parts.path = "/alerts/actions"
    parts.query = nil
    parts.fragment = nil
    return parts.url
#endif
  }

  private func send(_ job: Job, completion: @escaping () -> Void) {
    guard !active.contains(job.key) else { completion(); return }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let expiry = formatter.date(from: job.expiresAt), expiry > Date() else {
      remove(job)
      completion()
      return
    }
    guard let url = endpoint() else { reportFailure(); completion(); return }
    active.insert(job.key)
    var background = UIBackgroundTaskIdentifier.invalid
    var finished = false
    var task: URLSessionDataTask?
    let finish: () -> Void = {
      guard !finished else { return }
      finished = true
      self.active.remove(job.key)
      if background != .invalid { UIApplication.shared.endBackgroundTask(background); background = .invalid }
      completion()
    }
    background = UIApplication.shared.beginBackgroundTask(withName: "TaraGo notification action") {
      task?.cancel()
      self.reportFailure()
      finish()
    }
    var request = URLRequest(url: url, timeoutInterval: 8)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["token": job.token, "action": job.action])
    task = URLSession.shared.dataTask(with: request) { _, response, _ in
      DispatchQueue.main.async {
        guard !finished else { return }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if (200..<300).contains(status) || [400, 401, 404, 410].contains(status) {
          self.remove(job)
          UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [job.notificationId])
        } else { self.reportFailure() }
        finish()
      }
    }
    task?.resume()
  }

  private func keychainQuery() -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "pending"]
  }

  private func readJobs() throws -> [Job] {
    var query = keychainQuery()
    query[kSecReturnData as String] = true
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return [] }
    guard status == errSecSuccess, let data = result as? Data else { throw NSError(domain: service, code: Int(status)) }
    return try JSONDecoder().decode([Job].self, from: data)
  }

  private func saveJobs(_ jobs: [Job]) throws {
    let data = try JSONEncoder().encode(jobs)
    let query = keychainQuery()
    var status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if status == errSecItemNotFound {
      var insert = query
      insert[kSecValueData as String] = data
      insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      status = SecItemAdd(insert as CFDictionary, nil)
    }
    guard status == errSecSuccess else { throw NSError(domain: service, code: Int(status)) }
  }

  private func remove(_ job: Job) {
    do { try saveJobs(readJobs().filter { $0.key != job.key }) }
    catch { reportFailure() }
  }

  private func reportFailure() {
    let content = UNMutableNotificationContent()
    content.title = "알림 변경을 확인해주세요"
    content.body = "변경을 전송하지 못했어요. 앱을 열면 다시 시도해요."
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "tarago-action-retry", content: content, trigger: nil))
  }
}
