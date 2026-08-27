"""Voice biometrics (Phase 6): speaker verification + multi-voice detection.

Uses Resemblyzer (a pretrained d-vector speaker encoder, PyTorch CPU). No audio
codecs are needed on the server — the frontend sends raw Int16 PCM samples,
which we turn straight into a float waveform for the encoder.
"""

import base64

import numpy as np

_encoder = None  # lazy VoiceEncoder singleton
_warm = False    # True once the cold-start cost below has been paid

# Cosine thresholds for Resemblyzer d-vectors.
_MATCH_THRESHOLD = 0.75  # >= => same speaker
_DIARIZE_SEP = 0.72      # two cluster centroids below this cosine => likely 2 speakers
_MIN_SPEECH_SEC = 0.4    # after VAD trimming


def voice_available() -> bool:
    try:
        import resemblyzer  # noqa: F401

        return True
    except Exception:
        return False


def _encoder_get():
    global _encoder
    if _encoder is None:
        from resemblyzer import VoiceEncoder

        _encoder = VoiceEncoder(device="cpu", verbose=False)
    return _encoder


def is_warm() -> bool:
    return _warm


def _synthetic_clip(seconds: float = 8.0) -> str:
    """A voiced-sounding tone stack: harmonics over a wandering F0, syllable-rate
    amplitude modulation and a little noise. Needs to read as speech to webrtcvad,
    or preprocess_wav trims it to nothing and warmup never reaches the encoder.
    """
    t = np.arange(int(16000 * seconds), dtype=np.float32) / 16000
    f0 = 120 + 25 * np.sin(2 * np.pi * 0.7 * t)
    sig = np.zeros_like(t)
    for h in range(1, 13):
        sig += np.sin(2 * np.pi * f0 * h * t) / h
    sig = sig * (0.5 + 0.5 * np.sin(2 * np.pi * 3.1 * t))
    sig += 0.05 * np.random.default_rng(0).standard_normal(t.size)
    pcm = (np.clip(sig * 0.3, -1, 1) * 32767).astype(np.int16)
    return base64.b64encode(pcm.tobytes()).decode()


def warmup() -> bool:
    """Pay the cold-start cost at boot instead of inside a candidate's request.

    The first analyze() imports torch (~5s), scikit-learn (~3s), librosa and
    webrtcvad, builds the encoder, JIT-warms the first inference and runs the
    first KMeans fit — ~47s on a dev laptop, 4+ minutes on a small Railway
    container. The backend gives up after 35s, so whoever recorded first got a
    422 telling them to find a quieter room. Called once from the app's lifespan
    on a background thread, so the port still opens for the health check.

    It runs the real analyze() rather than warming stages by hand: importing
    preprocess_wav and KMeans without calling them left their first-call costs
    unpaid, which still cost a live request 200s on Railway. The clip is 8s so
    it yields the >=4 partials that take analyze() through the KMeans branch.
    """
    if _warm:
        return True
    if not voice_available():
        return False
    try:
        return bool(analyze(_synthetic_clip(), 16000).get("ok"))
    except Exception:
        return False


def _pcm16_to_float(audio_b64: str) -> np.ndarray:
    raw = base64.b64decode(audio_b64)
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def _cos(a, b) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


def analyze(audio_b64: str, sample_rate: int = 16000, reference=None) -> dict:
    global _warm
    if not voice_available():
        return {"ok": False, "error": "voice_unavailable"}
    try:
        from resemblyzer import preprocess_wav

        pcm = _pcm16_to_float(audio_b64)
        sr = int(sample_rate) or 16000
        duration = round(len(pcm) / max(sr, 1), 2)

        wav = preprocess_wav(pcm, source_sr=sr)
        if wav.size < int(16000 * _MIN_SPEECH_SEC):
            return {"ok": False, "error": "too_short", "duration": duration}

        enc = _encoder_get()
        embed, partials, _ = enc.embed_utterance(wav, return_partials=True, rate=1.3)
        embed = embed / (np.linalg.norm(embed) + 1e-9)

        # Multi-voice: split the per-window partial embeddings into two clusters;
        # if the centroids are dissimilar and both clusters are populated, a
        # second speaker is likely present.
        multi, voice_count = False, 1
        if len(partials) >= 4:
            from sklearn.cluster import KMeans

            km = KMeans(n_clusters=2, n_init=5, random_state=0).fit(partials)
            sep = _cos(km.cluster_centers_[0], km.cluster_centers_[1])
            sizes = np.bincount(km.labels_, minlength=2)
            if sep < _DIARIZE_SEP and sizes.min() >= max(2, len(partials) // 5):
                multi, voice_count = True, 2

        result = {
            "ok": True,
            "embedding": [round(float(x), 6) for x in embed],
            "multiVoice": multi,
            "voiceCount": voice_count,
            "duration": duration,
            "match": None,
        }
        if reference is not None and len(reference) == len(embed):
            ref = np.asarray(reference, dtype=np.float32)
            ref = ref / (np.linalg.norm(ref) + 1e-9)
            cos = _cos(embed, ref)
            result["match"] = {
                "score": int(np.clip(round(cos * 100), 0, 100)),
                "cosine": round(cos, 4),
                "matched": bool(cos >= _MATCH_THRESHOLD),
            }
        # Only now is every first-call cost on this path actually paid, so this
        # is the one place "warm" can be claimed honestly.
        _warm = True
        return result
    except Exception as e:  # never crash the interview over a bad clip
        return {"ok": False, "error": str(e)[:150]}
