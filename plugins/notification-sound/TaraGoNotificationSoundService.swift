import UserNotifications
import AVFoundation

/** 원래 푸시는 번들 음성이며, 검증된 도착 안내 파일이 있을 때만 상세 음성으로 승격한다. */
final class TaraGoNotificationSoundService: UNNotificationServiceExtension {
  override func didReceive(_ request: UNNotificationRequest, withContentHandler handler: @escaping (UNNotificationContent) -> Void) {
    guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
      handler(request.content);return
    }
    let info = content.userInfo
    let payload = info["body"] as? [AnyHashable: Any] ?? info["data"] as? [AnyHashable: Any] ?? info
    if let name = Self.exactSound(payload, directory: Self.soundsDirectory()) {
      content.sound = UNNotificationSound(named: UNNotificationSoundName(rawValue: name))
    }
    // 파일 없음·읽기 실패·잘못된 데이터는 원래 선택 목소리의 번들 sound를 유지한다.
    handler(content)
  }

  static func soundsDirectory() -> URL? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "TaraGoWidgetGroup") as? String else { return nil }
    return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?
      .appendingPathComponent("Library/Sounds", isDirectory: true)
  }

  static func exactSound(_ payload: [AnyHashable: Any], directory: URL?) -> String? {
    guard let name = payload["voiceExactSound"] as? String,
          name.range(of: "^tg_v1_[a-f0-9]{24}_[rs]_(soon|later|[1-9][0-9]?)\\.caf$", options: .regularExpression) != nil,
          let directory else { return nil }
    let file = directory.appendingPathComponent(name)
    guard let audio = try? AVAudioFile(forReading: file), audio.length > 0,
          audio.processingFormat.sampleRate > 0,
          let format = audio.fileFormat.settings[AVFormatIDKey] as? UInt32,
          [kAudioFormatLinearPCM, kAudioFormatAppleIMA4, kAudioFormatULaw, kAudioFormatALaw].contains(format),
          Double(audio.length) / audio.processingFormat.sampleRate < 29 else { return nil }
    return name
  }
}
