import UIKit
import UserNotifications
import UserNotificationsUI

/// The signed notification token controls only this reservation; no device secret enters the extension.
final class TaraGoNotificationContentViewController: UIViewController, UNNotificationContentExtension {
  private let titleLabel = UILabel()
  private let bodyLabel = UILabel()
  private let pauseSwitch = UISwitch()
  private let statusLabel = UILabel()
  private let spinner = UIActivityIndicatorView(style: .medium)
  private let retryButton = UIButton(type: .system)
  private let stack = UIStackView()
  private var actionToken: String?
  private var confirmed = false
  private var generation = UUID()
  private var task: URLSessionDataTask?
  private let redirectGuard = TaraGoNotificationRedirectGuard()
  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.urlCache = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.timeoutIntervalForRequest = 8
    configuration.timeoutIntervalForResource = 12
    return URLSession(configuration: configuration, delegate: redirectGuard, delegateQueue: nil)
  }()
  private struct State: Decodable { let pausedToday: Bool }

  override func loadView() {
    view = UIView()
    view.backgroundColor = .systemBackground
    overrideUserInterfaceStyle = .light
    stack.axis = .vertical
    stack.spacing = 12
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
      stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
      stack.topAnchor.constraint(equalTo: view.topAnchor, constant: 16),
      stack.bottomAnchor.constraint(lessThanOrEqualTo: view.bottomAnchor, constant: -12)
    ])
    titleLabel.font = .preferredFont(forTextStyle: .headline)
    titleLabel.adjustsFontForContentSizeCategory = true
    titleLabel.numberOfLines = 2
    bodyLabel.font = .preferredFont(forTextStyle: .subheadline)
    bodyLabel.adjustsFontForContentSizeCategory = true
    bodyLabel.textColor = .secondaryLabel
    bodyLabel.numberOfLines = 3
    let heading = UIStackView(arrangedSubviews: [titleLabel, bodyLabel])
    heading.axis = .vertical
    heading.spacing = 4
    stack.addArrangedSubview(heading)
    let separator = UIView()
    separator.backgroundColor = .separator
    separator.heightAnchor.constraint(equalToConstant: 1 / UIScreen.main.scale).isActive = true
    stack.addArrangedSubview(separator)
    let label = UILabel()
    label.text = "오늘은 쉬어요"
    label.font = .preferredFont(forTextStyle: .body)
    label.adjustsFontForContentSizeCategory = true
    label.numberOfLines = 0
    pauseSwitch.onTintColor = UIColor(red: 0.20, green: 0.52, blue: 0.96, alpha: 1)
    pauseSwitch.accessibilityLabel = "오늘은 쉬어요"
    pauseSwitch.addTarget(self, action: #selector(changePause), for: .valueChanged)
    pauseSwitch.isEnabled = false
    let row = UIStackView(arrangedSubviews: [label, pauseSwitch])
    row.alignment = .center
    row.spacing = 16
    row.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    pauseSwitch.setContentHuggingPriority(.required, for: .horizontal)
    pauseSwitch.setContentCompressionResistancePriority(.required, for: .horizontal)
    stack.addArrangedSubview(row)
    statusLabel.font = .preferredFont(forTextStyle: .footnote)
    statusLabel.adjustsFontForContentSizeCategory = true
    statusLabel.textColor = .secondaryLabel
    statusLabel.numberOfLines = 0
    retryButton.setTitle("다시 시도", for: .normal)
    retryButton.titleLabel?.font = .preferredFont(forTextStyle: .footnote)
    retryButton.addTarget(self, action: #selector(retry), for: .touchUpInside)
    retryButton.isHidden = true
    retryButton.setContentCompressionResistancePriority(.required, for: .horizontal)
    spinner.hidesWhenStopped = true
    let status = UIStackView(arrangedSubviews: [spinner, statusLabel, retryButton])
    status.alignment = .center
    status.spacing = 8
    status.heightAnchor.constraint(greaterThanOrEqualToConstant: 36).isActive = true
    stack.addArrangedSubview(status)
    preferredContentSize = CGSize(width: 0, height: 240)
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    guard view.bounds.width > 0 else { return }
    let size = stack.systemLayoutSizeFitting(
      CGSize(width: max(1, view.bounds.width - 40), height: 0),
      withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel
    )
    let height = ceil(size.height + 28)
    if abs(preferredContentSize.height - height) > 1 {
      preferredContentSize = CGSize(width: view.bounds.width, height: height)
    }
  }

  func didReceive(_ notification: UNNotification) {
    loadViewIfNeeded()
    task?.cancel()
    generation = UUID()
    confirmed = false
    actionToken = nil
    pauseSwitch.setOn(false, animated: false)
    pauseSwitch.isEnabled = false
    titleLabel.text = notification.request.content.title
    bodyLabel.text = notification.request.content.body
    let data = notification.request.content.userInfo
    let payload = data["body"] as? [AnyHashable: Any] ?? data
    guard let token = payload["actionToken"] as? String, token.count <= 2048,
          token.split(separator: ".").count == 2 else {
      fail("이 알림에서는 설정을 바꿀 수 없어요.", retryable: false)
      return
    }
    actionToken = token
    send("status")
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    if actionToken != nil && task == nil { send("status") }
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    generation = UUID()
    task?.cancel()
    task = nil
  }

  @objc private func changePause() {
    let desired = pauseSwitch.isOn
    // Display the last confirmed state until the server acknowledges the requested change.
    pauseSwitch.setOn(confirmed, animated: false)
    send(desired ? "pauseToday" : "resumeToday")
  }

  @objc private func retry() { send("status") }

  private func endpoint() -> URL? {
#if DEBUG
    let key = "TaraGoNotificationDevelopmentAPIOrigin"
#else
    let key = "TaraGoNotificationAPIOrigin"
#endif
    guard let origin = Bundle.main.object(forInfoDictionaryKey: key) as? String,
          var parts = URLComponents(string: origin), parts.host != nil,
          parts.user == nil, parts.password == nil else { return nil }
#if DEBUG
    guard parts.scheme == "https" || (parts.scheme == "http" && isLocalHost(parts.host!)) else { return nil }
#else
    guard parts.scheme == "https" else { return nil }
#endif
    parts.path = "/alerts/actions"
    parts.query = nil
    parts.fragment = nil
    return parts.url
  }

  private func isLocalHost(_ host: String) -> Bool {
    if host == "localhost" || host == "::1" || host.hasSuffix(".local") { return true }
    let pieces = host.split(separator: ".").compactMap { Int($0) }
    guard pieces.count == 4, pieces.allSatisfy({ (0...255).contains($0) }) else { return false }
    return pieces[0] == 10 || pieces[0] == 127 ||
      (pieces[0] == 192 && pieces[1] == 168) ||
      (pieces[0] == 172 && (16...31).contains(pieces[1]))
  }

  private func send(_ action: String) {
    guard let token = actionToken, let url = endpoint() else {
      fail("앱을 열어 연결 설정을 확인해주세요.", retryable: false)
      return
    }
    task?.cancel()
    let current = UUID()
    generation = current
    pauseSwitch.isEnabled = false
    retryButton.isHidden = true
    statusLabel.text = action == "status" ? "상태 확인 중" : "변경 중"
    spinner.startAnimating()
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["token": token, "action": action, "requestedAt": Int64(Date().timeIntervalSince1970 * 1000)])
    task = session.dataTask(with: request) { [weak self] data, response, error in
      DispatchQueue.main.async {
        guard let self, self.generation == current else { return }
        self.task = nil
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard error == nil, (200..<300).contains(status),
              let data, data.count <= 65_536,
              let state = try? JSONDecoder().decode(State.self, from: data) else {
          if [400, 401, 404, 410].contains(status) {
            self.fail("이 알림은 만료됐거나 예약이 변경됐어요.", retryable: false)
          } else {
            self.fail("연결을 확인하고 다시 시도해주세요.", retryable: true)
          }
          return
        }
        self.confirmed = state.pausedToday
        self.pauseSwitch.setOn(state.pausedToday, animated: true)
        self.pauseSwitch.isEnabled = true
        self.pauseSwitch.accessibilityValue = state.pausedToday ? "오늘 알림 중단" : "알림 사용"
        self.statusLabel.text = state.pausedToday ? "오늘 자정까지 쉬어요" : "예약대로 알려드려요"
        self.spinner.stopAnimating()
        self.view.setNeedsLayout()
      }
    }
    task?.resume()
  }

  private func fail(_ message: String, retryable: Bool) {
    spinner.stopAnimating()
    pauseSwitch.setOn(confirmed, animated: true)
    pauseSwitch.isEnabled = false
    statusLabel.text = message
    retryButton.isHidden = !retryable
    view.setNeedsLayout()
  }
}

private final class TaraGoNotificationRedirectGuard: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask,
                  willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                  completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }
}
