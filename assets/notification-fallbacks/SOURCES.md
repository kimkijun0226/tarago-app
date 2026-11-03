# Bundled notification fallback voices

Phrase for every profile: **도착 알림입니다. 앱에서 도착 정보를 확인해 주세요.**

Generated locally on 2026-11-02. No cloud speech service was called. These files are generic spoken fallback notifications; they contain no route, destination, or ETA claim.

| File profile | Actual voice source |
| --- | --- |
| clear-young | TaraGo server `assets/notification-voices/clear-young.wav` reference |
| soft-cute | TaraGo server `assets/notification-voices/soft-cute.wav` reference; hidden legacy profile |
| calm-woman | TaraGo server `assets/notification-voices/calm-woman.wav` reference |
| announcer-woman | TaraGo server `assets/notification-voices/announcer-woman.wav` reference |
| warm-man | TaraGo server `assets/notification-voices/warm-man.wav` reference |
| system-female | Installed macOS Korean Yuna, `com.apple.voice.super-compact.ko-KR.Yuna`; AVFoundation gender: female |
| system-male | Installed macOS Korean Eloquence character Eddy, `com.apple.eloquence.ko-KR.Eddy`; AVFoundation gender metadata: unspecified. Hidden legacy profile; no installed Korean voice reports male gender metadata. |

The five reference voices were rendered by the existing TaraGo server `voice/worker.py` `Generator().render()` using MLX Qwen3-TTS Base (`mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16`, cached snapshot `a6eb4f68e4b056f1215157bb696209bc82a6db48`), seed 42, temperature 0.3, and the worker's silence trimming. System voices were rendered with macOS `say`, explicitly selecting the voices above.

All `tg_fallback_v1_<profile>.caf` assets are mono, 24,000 Hz, signed 16-bit little-endian linear PCM in a CAF container. Each was checked with `afinfo`, decoded back to WAV with `afconvert`, and checked for finite, non-silent samples and duration below 29 seconds. Exact durations, peaks, and file sizes are in `validation.json`. This validation checks audio encoding and signal; it is not a listening or transcription review.
