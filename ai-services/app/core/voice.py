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


def warmup() -> bool:
    """Pay the cold-start cost at boot instead of inside a candidate's request.

    The first analyze() imports torch (~5s), scikit-learn (~3s), librosa and
    webrtcvad, builds the encoder and JIT-warms the first inference — ~47s on a
    dev laptop and well past three minutes on a small Railway container. The
    backend gives up after 35s, so whoever recorded first got a 422 telling them
    to find a quieter room. Called once from the app's lifespan on a background
    thread, so the port still opens immediately for the health check.
    """
    global _warm
    if _warm:
        return True
    if not voice_available():
        return False
    try:
        # Imported here, not at module scope, so a machine without the voice
        # stack still serves every other endpoint.
        from resemblyzer import preprocess_wav  # noqa: F401 — pulls librosa + webrtcvad
        from sklearn.cluster import KMeans  # noqa: F401 — the multi-voice path

        # Real inference on noise: loading the weights alone leaves the first
        # forward pass (and its allocations) unpaid.
        rng = np.random.default_rng(0)
        wav = (rng.standard_normal(16000 * 3) * 0.05).astype(np.float32)
        _encoder_get().embed_utterance(wav, return_partials=True, rate=1.3)
        _warm = True
        return True
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
        _warm = True  # a request beat the warmup thread to it

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
        return result
    except Exception as e:  # never crash the interview over a bad clip
        return {"ok": False, "error": str(e)[:150]}
