package expo.modules.taragovoice

import android.app.NotificationChannel
import android.app.NotificationChannelGroup
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class VoiceSound : Record {
  @Field var source: String = ""
  @Field var time: String = ""
  @Field var url: String = ""
}

class VoiceRequest : Record {
  @Field var key: String = ""
  @Field var authorization: String = ""
  @Field var sounds: List<VoiceSound> = emptyList()
}

class TaraGoNotificationVoiceModule : Module() {
  private val operations = Mutex()
  private val interruption = AtomicInteger()
  private val previewGeneration = AtomicInteger()
  private val main = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var finishPreview: (() -> Unit)? = null
  @Volatile private var background = false

  private fun rejectSystemVoice(): Unit { throw systemUnavailable() }

  override fun definition() = ModuleDefinition {
    Name("TaraGoNotificationVoice")
    Constants("apiVersion" to 4, "previewProfiles" to listOf("clear-young", "soft-cute", "calm-woman", "announcer-woman", "warm-man"))
    // Android TTS does not expose reliable gender metadata for Korean voices.
    AsyncFunction("systemAvailability") { mapOf("system-female" to false, "system-male" to false) }
    AsyncFunction("prepareSystem") { _: Map<String, Any> -> rejectSystemVoice() }
    AsyncFunction("playSystemPreview") { _: Map<String, Any> -> rejectSystemVoice() }
    AsyncFunction("prepare") Coroutine { request: VoiceRequest ->
      val context = appContext.reactContext ?: error("Application context is unavailable")
      val generation = interruption.get()
      withContext(Dispatchers.IO) { operations.withLock { prepare(context, request, generation) } }
    }
    AsyncFunction("prune") Coroutine { keys: List<String> ->
      val context = appContext.reactContext ?: error("Application context is unavailable")
      withContext(Dispatchers.IO) { operations.withLock { prune(context, keys) } }
    }
    AsyncFunction("playPreview") Coroutine { address: String ->
      val context = appContext.reactContext ?: error("Application context is unavailable")
      val generation = previewGeneration.incrementAndGet()
      withContext(Dispatchers.Main) { stopPlayer() }
      val lifecycle = interruption.get()
      val url = checkedURL(address)
      require(url.path.matches(Regex(".*/alerts/voices/(clear-young|soft-cute|calm-woman|announcer-woman|warm-man)/preview")))
      val file = withContext(Dispatchers.IO) {
        File.createTempFile("tarago-preview-", ".wav", context.cacheDir).also {
          try { download(url, null, it, lifecycle) } catch (error: Throwable) { it.delete(); throw error }
        }
      }
      try {
        withContext(Dispatchers.Main) {
          if (generation == previewGeneration.get()) {
            checkActive(lifecycle)
            play(file)
          }
        }
      } finally { withContext(Dispatchers.IO) { file.delete() } }
    }
    AsyncFunction("stopPreview") Coroutine { ->
      previewGeneration.incrementAndGet()
      withContext(Dispatchers.Main) { stopPlayer() }
    }
    OnActivityEntersForeground { background = false }
    OnActivityEntersBackground { interrupt() }
    OnDestroy { interrupt() }
  }

  private fun interrupt() {
    background = true
    interruption.incrementAndGet()
    previewGeneration.incrementAndGet()
    main.post { stopPlayer() }
  }

  private fun checkActive(generation: Int) {
    check(!background && interruption.get() == generation) { "Voice preparation was interrupted" }
  }

  private fun checkedURL(address: String): URL {
    require(address.length in 1..2048)
    val url = URL(address)
    require(url.protocol in listOf("http", "https") && url.host.isNotEmpty() && url.userInfo == null && url.ref == null)
    return url
  }

  private fun origin(url: URL) = Triple(url.protocol.lowercase(), url.host.lowercase(), if (url.port == -1) url.defaultPort else url.port)

  /** Redirects are rejected so device credentials never leave the API origin. */
  private fun download(url: URL, authorization: String?, target: File, generation: Int) {
    checkActive(generation)
    val connection = url.openConnection() as HttpURLConnection
    val deadline = System.nanoTime() + 60_000_000_000L
    try {
      connection.instanceFollowRedirects = false
      connection.connectTimeout = 60_000
      connection.readTimeout = 60_000
      connection.setRequestProperty("Accept", "audio/wav")
      if (authorization != null) connection.setRequestProperty("Authorization", authorization)
      connection.connect()
      val responseTime = (deadline - System.nanoTime()) / 1_000_000
      check(responseTime > 0) { "Voice download timed out" }
      connection.readTimeout = responseTime.coerceAtMost(60_000).toInt().coerceAtLeast(1)
      check(connection.responseCode == 200) { "Voice download failed (${connection.responseCode})" }
      check(connection.contentLengthLong <= 2_000_000L) { "Voice download is too large" }
      connection.inputStream.use { input ->
        target.outputStream().use { output ->
          val bytes = ByteArray(16_384)
          var total = 0
          while (true) {
            checkActive(generation)
            val remaining = (deadline - System.nanoTime()) / 1_000_000
            check(remaining > 0) { "Voice download timed out" }
            connection.readTimeout = remaining.coerceAtMost(60_000).toInt().coerceAtLeast(1)
            val count = input.read(bytes)
            if (count < 0) break
            total += count
            check(total <= 2_000_000) { "Voice download is too large" }
            output.write(bytes, 0, count)
          }
        }
      }
      checkActive(generation)
      check(valid(target)) { "Invalid notification WAV" }
    } finally { connection.disconnect() }
  }

  private fun prepare(context: Context, request: VoiceRequest, generation: Int) {
    check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) { "Spoken notification channels require Android 8 or later" }
    require(request.key.matches(Regex("[a-f0-9]{24}")))
    require(request.authorization.length in 8..8192 && request.authorization.matches(Regex("Bearer [A-Za-z0-9._~+/-]+=*")))
    require(request.sounds.size in 1..124)
    require(request.sounds.map { it.source to it.time }.toSet().size == request.sounds.size)
    val urls = request.sounds.map {
      require(it.source in listOf("r", "s") && (it.time in listOf("soon", "later") || it.time.matches(Regex("[1-9]|[1-5][0-9]|60"))))
      checkedURL(it.url)
    }
    require(urls.all { origin(it) == origin(urls.first()) })
    val directory = File(context.filesDir, "tarago-voice-v1").apply { check(isDirectory || mkdirs()) }
    for ((index, sound) in request.sounds.withIndex()) {
      checkActive(generation)
      val target = File(directory, "tg_v1_${request.key}_${sound.source}_${sound.time}.wav")
      if (!valid(target)) {
        val temporary = File(directory, target.name + ".partial")
        try {
          download(urls[index], request.authorization, temporary, generation)
          checkActive(generation)
          check(temporary.renameTo(target)) { "Could not store notification audio" }
        } finally { temporary.delete() }
      }
    }
    checkActive(generation)
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val existingChannels = manager.notificationChannels.map { it.id }.toSet()
    val allocations = context.getSharedPreferences("tarago_voice_channel_allocations", Context.MODE_PRIVATE)
    val allocatedIds = allocations.getStringSet("ids", emptySet())!!.toMutableSet()
    allocatedIds.addAll(existingChannels.filter { it.startsWith("tg_v1_") })
    check(allocations.edit().putStringSet("ids", allocatedIds).commit()) { "Could not persist voice channel allocations" }
    val requestedIds = request.sounds.map { "tg_v1_${request.key}_${it.source}_${it.time}" }
    // Android retains deleted channel tombstones until uninstall; pruning cannot reclaim this budget.
    if ((allocatedIds + existingChannels + requestedIds).size > 450) throw channelLimit()
    val group = "tg_voice_group_${request.key}"
    manager.createNotificationChannelGroup(NotificationChannelGroup(group, "타라고 음성 알림"))
    for (sound in request.sounds) {
      checkActive(generation)
      val stem = "tg_v1_${request.key}_${sound.source}_${sound.time}"
      val target = File(directory, "$stem.wav")
      val uri = FileProvider.getUriForFile(context, "${context.packageName}.tarago.voice", target)
      context.grantUriPermission("android", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      context.grantUriPermission("com.android.systemui", uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      // Keep existing channels intact to preserve the user's sound and mute choices.
      if (manager.getNotificationChannel(stem) != null) continue
      val label = when (sound.time) { "soon" -> "곧 도착"; "later" -> "도착 안내"; else -> "${sound.time}분 후" }
      val channel = NotificationChannel(stem, (if (sound.source == "s") "시간표 · " else "") + label, NotificationManager.IMPORTANCE_HIGH)
      channel.group = group
      channel.setSound(uri, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
      channel.enableVibration(true)
      try {
        manager.createNotificationChannel(channel)
      } catch (error: IllegalStateException) {
        throw channelLimit(error)
      }
      allocatedIds.add(stem)
      check(allocations.edit().putStringSet("ids", allocatedIds).commit()) { "Could not persist voice channel allocations" }
    }
    checkActive(generation)
  }

  private fun systemUnavailable() = CodedException("E_SYSTEM_VOICE_UNAVAILABLE", "이 기기에서는 성별이 확인된 한국어 기본 음성을 사용할 수 없어요.", null)

  private fun channelLimit(cause: Throwable? = null) = CodedException(
    "E_VOICE_CHANNEL_LIMIT",
    "이 기기에 저장된 음성 알림이 많아 기본 알림음으로 알려드려요.",
    cause
  )

  private suspend fun play(file: File) = suspendCancellableCoroutine<Unit> { continuation ->
    val current = MediaPlayer()
    player = current
    finishPreview = { if (continuation.isActive) continuation.resume(Unit) }
    current.setOnCompletionListener { stopPlayer() }
    current.setOnErrorListener { _, _, _ ->
      finishPreview = null
      stopPlayer()
      if (continuation.isActive) continuation.resumeWithException(IllegalStateException("Voice preview playback failed"))
      true
    }
    current.setOnPreparedListener {
      try { it.start() } catch (error: Exception) {
        finishPreview = null
        stopPlayer()
        if (continuation.isActive) continuation.resumeWithException(error)
      }
    }
    continuation.invokeOnCancellation { main.post { if (player === current) stopPlayer() } }
    try {
      current.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
      current.setDataSource(file.absolutePath)
      current.prepareAsync()
    } catch (error: Exception) {
      finishPreview = null
      stopPlayer()
      if (continuation.isActive) continuation.resumeWithException(error)
    }
  }

  private fun stopPlayer() {
    val completion = finishPreview
    finishPreview = null
    player?.release()
    player = null
    completion?.invoke()
  }

  private fun valid(file: File): Boolean {
    if (!file.isFile || file.length() !in 45..2_000_000) return false
    val data = file.readBytes()
    val bytes = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN)
    if (String(data, 0, 4, Charsets.US_ASCII) != "RIFF" || String(data, 8, 4, Charsets.US_ASCII) != "WAVE" || bytes.getInt(4).toLong() + 8 != data.size.toLong()) return false
    var at = 12
    var byteRate = 0
    var alignment = 0
    var pcmSize = 0
    var hasFormat = false
    while (at + 8 <= data.size) {
      val size = bytes.getInt(at + 4)
      if (size < 0 || size > data.size - at - 8) return false
      when (String(data, at, 4, Charsets.US_ASCII)) {
        "fmt " -> {
          if (hasFormat || size < 16) return false
          hasFormat = true
          val channels = bytes.getShort(at + 10).toInt()
          val sampleRate = bytes.getInt(at + 12)
          byteRate = bytes.getInt(at + 16)
          alignment = bytes.getShort(at + 20).toInt()
          val bits = bytes.getShort(at + 22).toInt()
          if (bytes.getShort(at + 8).toInt() != 1 || channels !in 1..2 || sampleRate !in 8000..192000 || bits !in listOf(8, 16, 24, 32) || alignment != channels * bits / 8 || byteRate != sampleRate * alignment) return false
        }
        "data" -> { if (pcmSize != 0) return false; pcmSize = size }
      }
      at += 8 + size + size % 2
    }
    return at == data.size && hasFormat && pcmSize > 0 && pcmSize % alignment == 0 && pcmSize.toDouble() / byteRate < 29
  }

  private fun prune(context: Context, keys: List<String>) {
    require(keys.size <= 80 && keys.all { it.matches(Regex("[a-f0-9]{24}")) })
    val keep = keys.toSet()
    val directory = File(context.filesDir, "tarago-voice-v1")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.notificationChannels.filter { it.id.startsWith("tg_v1_") && it.id.split('_').getOrNull(2) !in keep }.forEach { manager.deleteNotificationChannel(it.id) }
      manager.notificationChannelGroups.filter { it.id.startsWith("tg_voice_group_") && it.id.removePrefix("tg_voice_group_") !in keep }.forEach { manager.deleteNotificationChannelGroup(it.id) }
    }
    directory.listFiles()?.filter { it.name.startsWith("tg_v1_") && it.name.split('_').getOrNull(2) !in keep }?.forEach {
      val uri = FileProvider.getUriForFile(context, "${context.packageName}.tarago.voice", it)
      context.revokeUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      check(it.delete())
    }
    File(context.cacheDir, "tarago-voice-v1").listFiles()?.filter { it.name.startsWith("prefix_") && it.name.removePrefix("prefix_").take(24) !in keep }?.forEach { check(it.delete()) }
  }
}

class TaraGoVoiceFileProvider : FileProvider()
