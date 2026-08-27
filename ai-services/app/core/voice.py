"""Voice biometrics (Phase 6): speaker verification + multi-voice detection.

Uses Resemblyzer (a pretrained d-vector speaker encoder, PyTorch CPU). No audio
codecs are needed on the server — the frontend sends raw Int16 PCM samples,
which we turn straight into a float waveform for the encoder.
"""

import base64

import numpy as np

_encoder = None  # lazy VoiceEncoder singleton

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


def _pcm16_to_float(audio_b64: str) -> np.ndarray:
    raw = base64.b64decode(audio_b64)
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def _cos(a, b) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


def analyze(audio_b64: str, sample_rate: int = 16000, reference=None) -> dict:
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
        return result
    except Exception as e:  # never crash the interview over a bad clip
        return {"ok": False, "error": str(e)[:150]}
