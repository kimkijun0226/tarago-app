import ExpoModulesCore
import AVFoundation
import UIKit

struct TaraGoVoiceSound: Record {
  @Field var source: String = ""
  @Field var time: String = ""
  @Field var url: String = ""
}
struct TaraGoVoiceRequest: Record {
  @Field var key: String = ""
  @Field var authorization: String = ""
  @Field var sounds: [TaraGoVoiceSound] = []
}

struct TaraGoSystemVoiceRequest: Record {
  @Field var key: String = ""
  @Field var profile: String = ""
  @Field var phrase: String = ""
  @Field var maxMinutes: Int = 0
  @Field var schedule: Bool = false
}

public final class TaraGoNotificationVoiceModule: Module {
  @MainActor private lazy var engine = TaraGoVoiceEngine()
  public func definition() -> ModuleDefinition {
    Name("TaraGoNotificationVoice")
    let profiles = ["clear-young", "soft-cute", "calm-woman", "announcer-woman", "warm-man", "system-female", "system-male"]
    let bundled = profiles.allSatisfy { Bundle.main.url(forResource: "tg_fallback_v1_\($0)", withExtension: "caf") != nil }
    Constants(["bundledVersion": bundled ? 1 : 0, "apiVersion": 4, "previewProfiles": ["clear-young", "soft-cute", "calm-woman", "announcer-woman", "warm-man"]] as [String: Any])
    AsyncFunction("systemAvailability") { (promise: Promise) in
      Task { @MainActor in promise.resolve(self.engine.systemAvailability()) }
    }.runOnQueue(.main)
    AsyncFunction("prepareSystem") { (request: TaraGoSystemVoiceRequest, promise: Promise) in
      Task { @MainActor in
        do { try await self.engine.prepareSystem(request); promise.resolve() }
        catch { promise.reject(error) }
      }
    }.runOnQueue(.main)
    AsyncFunction("playSystemPreview") { (request: TaraGoSystemVoiceRequest, promise: Promise) in
      Task { @MainActor in
        do { try await self.engine.playSystemPreview(request); promise.resolve() }
        catch { promise.reject(error) }
      }
    }.runOnQueue(.main)
    AsyncFunction("prepare") { (request: TaraGoVoiceRequest, promise: Promise) in
      Task { @MainActor in
        do { try await self.engine.prepare(request); promise.resolve() }
        catch { promise.reject(error) }
      }
    }.runOnQueue(.main)
    AsyncFunction("prune") { (keys: [String], promise: Promise) in
      Task { @MainActor in
        do { try self.engine.prune(keys); promise.resolve() }
        catch { promise.reject(error) }
      }
    }.runOnQueue(.main)
    AsyncFunction("playPreview") { (url: String, promise: Promise) in
      Task { @MainActor in
        do { try await self.engine.playPreview(url); promise.resolve() }
        catch { promise.reject(error) }
      }
    }.runOnQueue(.main)
    AsyncFunction("stopPreview") { (promise: Promise) in
      Task { @MainActor in self.engine.stopPreview(); promise.resolve() }
    }.runOnQueue(.main)
    OnDestroy { Task { @MainActor in self.engine.shutdown() } }
  }
}

@MainActor private final class TaraGoVoiceEngine: NSObject, AVAudioPlayerDelegate {
  private let files = FileManager.default
  private var busy = false
  private var speech: AVSpeechSynthesizer?
  private var speechIsPreview = false
  private var cancelSpeech: (() -> Void)?
  private var session: URLSession?
  private var generation = 0
  private var player: AVAudioPlayer?
  private var previewSession: URLSession?
  private var previewID = UUID()
  private var previewCompletion: CheckedContinuation<Void, Error>?
  private var audioActive = false
  private var sounds: URL {
    if let group = Bundle.main.object(forInfoDictionaryKey: "TaraGoWidgetGroup") as? String,
       let shared = files.containerURL(forSecurityApplicationGroupIdentifier: group) {
      return shared.appendingPathComponent("Library/Sounds", isDirectory: true)
    }
    return files.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Sounds", isDirectory: true)
  }
  private var cache: URL { files.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("tarago-ai-voice-v1", isDirectory: true) }

  override init() {
    super.init()
    NotificationCenter.default.addObserver(self, selector: #selector(background), name: UIApplication.didEnterBackgroundNotification, object: nil)
  }
  deinit { NotificationCenter.default.removeObserver(self) }
  @objc private func background() { shutdown() }
  func shutdown() {
    cancelSpeech?()
    speech?.stopSpeaking(at: .immediate)
    generation += 1
    session?.invalidateAndCancel()
    stopPreview()
  }

  private func systemVoice(_ profile: String) -> AVSpeechSynthesisVoice? {
    guard ["system-female", "system-male"].contains(profile) else { return nil }
    let gender: AVSpeechSynthesisVoiceGender = profile == "system-male" ? .male : .female
    return AVSpeechSynthesisVoice.speechVoices().first { $0.language.hasPrefix("ko") && $0.gender == gender }
  }
  func systemAvailability() -> [String: Bool] {
    ["system-female": systemVoice("system-female") != nil, "system-male": systemVoice("system-male") != nil]
  }
  private func systemText(_ request: TaraGoSystemVoiceRequest, source: String, time: String) -> String {
    let arrival = time == "soon" ? "곧 도착예정" : time == "later" ? "\(request.maxMinutes)분이후 도착예정" : "\(time)분후 도착예정"
    return "\(request.phrase), \(arrival).\(source == "s" ? " 시간표 기준." : "")"
  }
  private func synthesize(_ text: String, voice: AVSpeechSynthesisVoice, to target: URL, preview: Bool = false) async throws {
    guard UIApplication.shared.applicationState == .active else { throw failure(2) }
    let temporary = cache.appendingPathComponent(UUID().uuidString + ".caf")
    defer { try? files.removeItem(at: temporary) }
    let utterance = AVSpeechUtterance(string: text.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression))
    utterance.voice = voice
    utterance.rate = 0.53
    utterance.preUtteranceDelay = 0
    utterance.postUtteranceDelay = 0
    let synthesizer = AVSpeechSynthesizer()
    speech = synthesizer
    speechIsPreview = preview
    let timeout = Task { @MainActor in
      try? await Task.sleep(nanoseconds: 15_000_000_000)
      guard !Task.isCancelled else { return }
      self.cancelSpeech?()
      synthesizer.stopSpeaking(at: .immediate)
    }
    defer { timeout.cancel(); speech = nil; speechIsPreview = false; cancelSpeech = nil }
    try await withCheckedThrowingContinuation { (completion: CheckedContinuation<Void, Error>) in
      var output: AVAudioFile?
      var finished = false
      cancelSpeech = {
        guard !finished else { return }
        finished = true
        output = nil
        completion.resume(throwing: self.failure(2))
      }
      synthesizer.write(utterance) { buffer in
        DispatchQueue.main.async {
        guard !finished else { return }
        guard let pcm = buffer as? AVAudioPCMBuffer else { return }
        do {
          if pcm.frameLength == 0 {
            finished = true
            output = nil
            completion.resume()
          } else {
            if output == nil { output = try AVAudioFile(forWriting: temporary, settings: pcm.format.settings) }
            try output?.write(from: pcm)
          }
        } catch {
          finished = true
          output = nil
          completion.resume(throwing: error)
        }
        }
      }
    }
    guard UIApplication.shared.applicationState == .active else { throw failure(2) }
    try compress(temporary, to: target)
  }
  func prepareSystem(_ request: TaraGoSystemVoiceRequest) async throws {
    guard validKey(request.key), !busy, (1...60).contains(request.maxMinutes),
          (1...120).contains(request.phrase.count), let voice = systemVoice(request.profile) else { throw failure(6) }
    busy = true
    defer { busy = false }
    try files.createDirectory(at: sounds, withIntermediateDirectories: true)
    try files.createDirectory(at: cache, withIntermediateDirectories: true)
    let token = generation
    for source in request.schedule ? ["r", "s"] : ["r"] {
      for time in (source == "r" ? ["soon", "later"] : ["later"]) + (1...request.maxMinutes).map(String.init) {
        guard token == generation, UIApplication.shared.applicationState == .active else { throw failure(2) }
        let target = sounds.appendingPathComponent("tg_v1_\(request.key)_\(source)_\(time).caf")
        if valid(target) { continue }
        try await synthesize(systemText(request, source: source, time: time), voice: voice, to: target)
      }
    }
  }
  func playSystemPreview(_ request: TaraGoSystemVoiceRequest) async throws {
    stopPreview()
    guard !busy, (1...120).contains(request.phrase.count), let voice = systemVoice(request.profile) else { throw failure(6) }
    busy = true
    defer { busy = false }
    let token = previewID
    try files.createDirectory(at: cache, withIntermediateDirectories: true)
    let destination = cache.appendingPathComponent("system-preview.caf")
    try await synthesize(systemText(request, source: "r", time: "5"), voice: voice, to: destination, preview: true)
    guard token == previewID else { return }
    let audioSession = AVAudioSession.sharedInstance()
    try audioSession.setCategory(.playback, mode: .spokenAudio, options: .duckOthers)
    try audioSession.setActive(true)
    audioActive = true
    let next = try AVAudioPlayer(contentsOf: destination)
    player = next
    next.delegate = self
    try await withCheckedThrowingContinuation { (completion: CheckedContinuation<Void, Error>) in
      previewCompletion = completion
      if !next.play() { finishPreview(failure(4)) }
    }
  }

  func prepare(_ request: TaraGoVoiceRequest) async throws {
    guard validKey(request.key), !busy, (1...124).contains(request.sounds.count),
          request.authorization.hasPrefix("Bearer "), request.authorization.count <= 1024 else { throw failure(1) }
    var identifiers = Set<String>()
    var origin: String?
    for sound in request.sounds {
      guard ["r", "s"].contains(sound.source), validTime(sound.time), let url = apiURL(sound.url),
            url.path.contains("/alerts/voice/"), identifiers.insert("\(sound.source)_\(sound.time)").inserted else { throw failure(1) }
      let current = "\(url.scheme!)://\(url.host!):\(url.port ?? (url.scheme == "https" ? 443 : 80))"
      if let origin, origin != current { throw failure(1) }
      origin = current
    }
    busy = true
    defer { session?.invalidateAndCancel(); session = nil; busy = false }
    let token = generation
    try files.createDirectory(at: sounds, withIntermediateDirectories: true)
    try files.createDirectory(at: cache, withIntermediateDirectories: true)
    var directory = sounds
    var backup = URLResourceValues()
    backup.isExcludedFromBackup = true
    try directory.setResourceValues(backup)
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 60
    config.timeoutIntervalForResource = 120
    config.httpShouldSetCookies = false
    let network = URLSession(configuration: config, delegate: TaraGoVoiceRedirectGuard(), delegateQueue: nil)
    session = network
    for sound in request.sounds {
      let stem = "tg_v1_\(request.key)_\(sound.source)_\(sound.time)"
      let target = sounds.appendingPathComponent(stem + ".caf")
      if valid(target) { continue }
      guard UIApplication.shared.applicationState == .active, token == generation else { throw failure(2) }
      var download = URLRequest(url: apiURL(sound.url)!)
      download.setValue(request.authorization, forHTTPHeaderField: "Authorization")
      let (temporary, response) = try await network.download(for: download)
      defer { try? files.removeItem(at: temporary) }
      guard UIApplication.shared.applicationState == .active, token == generation,
            sameOrigin(download.url!, response.url), (response as? HTTPURLResponse)?.statusCode == 200,
            validDownload(temporary), valid(temporary) else { throw failure(3) }
      try compress(temporary, to: target)
      await Task.yield()
    }
  }

  func playPreview(_ address: String) async throws {
    stopPreview()
    guard let url = apiURL(address),
          url.path.range(of: "/alerts/voices/(clear-young|soft-cute|calm-woman|announcer-woman|warm-man)/preview$", options: .regularExpression) != nil,
          UIApplication.shared.applicationState == .active else { throw failure(1) }
    let token = previewID
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 30
    configuration.timeoutIntervalForResource = 60
    let network = URLSession(configuration: configuration, delegate: TaraGoVoiceRedirectGuard(), delegateQueue: nil)
    previewSession = network
    do {
      let (temporary, response) = try await network.download(from: url)
      defer { try? files.removeItem(at: temporary) }
      guard token == previewID else { return }
      guard UIApplication.shared.applicationState == .active, sameOrigin(url, response.url),
            (response as? HTTPURLResponse)?.statusCode == 200, validDownload(temporary), valid(temporary) else { throw failure(3) }
      try files.createDirectory(at: cache, withIntermediateDirectories: true)
      let destination = cache.appendingPathComponent("preview.wav")
      if files.fileExists(atPath: destination.path) { try files.removeItem(at: destination) }
      try files.moveItem(at: temporary, to: destination)
      network.invalidateAndCancel()
      previewSession = nil
      let audioSession = AVAudioSession.sharedInstance()
      try audioSession.setCategory(.playback, mode: .spokenAudio, options: .duckOthers)
      try audioSession.setActive(true)
      audioActive = true
      let next = try AVAudioPlayer(contentsOf: destination)
      player = next
      next.delegate = self
      try await withCheckedThrowingContinuation { (completion: CheckedContinuation<Void, Error>) in
        previewCompletion = completion
        if !next.play() { finishPreview(failure(4)) }
      }
    } catch {
      if token != previewID { return }
      finishPreview(error)
      throw error
    }
  }

  func stopPreview() {
    // Dismissing a preview must not cancel notification sound preparation.
    if speechIsPreview {
      cancelSpeech?()
      speech?.stopSpeaking(at: .immediate)
    }
    previewID = UUID()
    finishPreview(nil)
  }
  private func finishPreview(_ error: Error?) {
    previewSession?.invalidateAndCancel()
    previewSession = nil
    player?.stop()
    player = nil
    if audioActive {
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      audioActive = false
    }
    let completion = previewCompletion
    previewCompletion = nil
    if let error { completion?.resume(throwing: error) } else { completion?.resume() }
  }
  nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    Task { @MainActor in
      guard self.player === player else { return }
      self.finishPreview(flag ? nil : self.failure(4))
    }
  }
  nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
    Task { @MainActor in
      guard self.player === player else { return }
      self.finishPreview(error ?? self.failure(4))
    }
  }

  /** OS notification sounds must already exist locally and remain readable after locking. */
  private func compress(_ inputURL: URL, to target: URL) throws {
    let source = try AVAudioFile(forReading: inputURL)
    let format = AVAudioFormat(standardFormatWithSampleRate: 22_050, channels: 1)!
    guard source.length > 0, Double(source.length) / source.processingFormat.sampleRate < 29,
          let input = AVAudioPCMBuffer(pcmFormat: source.processingFormat, frameCapacity: AVAudioFrameCount(source.length)),
          let converter = AVAudioConverter(from: source.processingFormat, to: format),
          let converted = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(ceil(Double(source.length) * format.sampleRate / source.processingFormat.sampleRate)) + 1024) else { throw failure(5) }
    try source.read(into: input)
    var consumed = false
    var error: NSError?
    let status = converter.convert(to: converted, error: &error) { _, state in
      if consumed { state.pointee = .endOfStream; return nil }
      consumed = true
      state.pointee = .haveData
      return input
    }
    if let error { throw error }
    guard status != .error, converted.frameLength > 0, Double(converted.frameLength) / format.sampleRate < 29 else { throw failure(5) }
    let temporary = cache.appendingPathComponent(target.lastPathComponent + ".partial.caf")
    defer { try? files.removeItem(at: temporary) }
    var destination: AVAudioFile? = try AVAudioFile(forWriting: temporary, settings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 22_050, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false], commonFormat: .pcmFormatFloat32, interleaved: false)
    try destination?.write(from: converted)
    destination = nil
    try files.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: temporary.path)
    if files.fileExists(atPath: target.path) { try files.removeItem(at: target) }
    try files.moveItem(at: temporary, to: target)
  }

  func prune(_ keys: [String]) throws {
    guard !busy, keys.count <= 80, keys.allSatisfy(validKey) else { throw failure(1) }
    let keep = Set(keys)
    guard files.fileExists(atPath: sounds.path) else { return }
    for path in try files.contentsOfDirectory(at: sounds, includingPropertiesForKeys: nil) where path.lastPathComponent.hasPrefix("tg_v1_") {
      let values = path.lastPathComponent.split(separator: "_")
      if values.count > 2 && !keep.contains(String(values[2])) { try files.removeItem(at: path) }
    }
  }
  private func validKey(_ value: String) -> Bool { value.range(of: "^[a-f0-9]{24}$", options: .regularExpression) != nil }
  private func validTime(_ value: String) -> Bool { ["soon", "later"].contains(value) || (Int(value).map { (1...60).contains($0) && String($0) == value } ?? false) }
  private func apiURL(_ value: String) -> URL? {
    guard let url = URL(string: value), ["http", "https"].contains(url.scheme ?? ""), url.host != nil, url.user == nil, url.password == nil, url.fragment == nil else { return nil }
    return url
  }
  private func sameOrigin(_ expected: URL, _ actual: URL?) -> Bool {
    guard let actual else { return false }
    return expected.scheme == actual.scheme && expected.host == actual.host && expected.port == actual.port
  }
  private func validDownload(_ path: URL) -> Bool {
    guard let size = (try? files.attributesOfItem(atPath: path.path)[.size] as? NSNumber)?.intValue, (44...2_000_000).contains(size),
          let handle = try? FileHandle(forReadingFrom: path) else { return false }
    defer { try? handle.close() }
    guard let data = try? handle.read(upToCount: 12), data.count == 12 else { return false }
    return String(data: data.prefix(4), encoding: .ascii) == "RIFF" && String(data: data.suffix(4), encoding: .ascii) == "WAVE"
  }
  private func valid(_ path: URL) -> Bool {
    guard let file = try? AVAudioFile(forReading: path), file.length > 0 else { return false }
    return Double(file.length) / file.processingFormat.sampleRate < 29
  }
  private func failure(_ code: Int) -> NSError { NSError(domain: "TaraGoVoice", code: code) }
}

/** Never forward the device credential through an HTTP redirect. */
private final class TaraGoVoiceRedirectGuard: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }
}
