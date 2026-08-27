"""Face detection, identity match and emotion (Phase 5).

Runs entirely on CPU with ONNX models (no TensorFlow):
  - YuNet  → face detection (+ 5 landmarks)
  - SFace  → 128-d face embedding for identity match (cosine similarity)
  - FER+   → 8-class facial emotion, mapped to confidence / stress

Models are loaded lazily on first use and cached as module singletons.
"""

import base64
import binascii
import os

import cv2
import numpy as np
import onnxruntime as ort

_WEIGHTS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "models", "weights")
_YUNET = os.path.join(_WEIGHTS, "yunet.onnx")
_SFACE = os.path.join(_WEIGHTS, "sface.onnx")
_FERPLUS = os.path.join(_WEIGHTS, "emotion_ferplus.onnx")

# FER+ output order.
_EMOTIONS = ["neutral", "happiness", "surprise", "sadness", "anger", "disgust", "fear", "contempt"]
# Emotions that read as composed/engaged vs. negatively aroused in an interview.
_CALM = {"neutral", "happiness", "surprise"}
_STRESS = {"sadness", "anger", "disgust", "fear", "contempt"}

# SFace cosine threshold for "same person" (OpenCV Zoo default).
_MATCH_THRESHOLD = 0.363

_detector = None
_recognizer = None
_emotion_sess = None
_emotion_io = None


def models_available() -> bool:
    return all(os.path.exists(p) for p in (_YUNET, _SFACE, _FERPLUS))


def _detector_get():
    global _detector
    if _detector is None:
        _detector = cv2.FaceDetectorYN.create(_YUNET, "", (320, 320), 0.7, 0.3, 5000)
    return _detector


def _recognizer_get():
    global _recognizer
    if _recognizer is None:
        _recognizer = cv2.FaceRecognizerSF.create(_SFACE, "")
    return _recognizer


def _emotion_get():
    global _emotion_sess, _emotion_io
    if _emotion_sess is None:
        _emotion_sess = ort.InferenceSession(_FERPLUS, providers=["CPUExecutionProvider"])
        _emotion_io = (_emotion_sess.get_inputs()[0].name, _emotion_sess.get_outputs()[0].name)
    return _emotion_sess, _emotion_io


def decode_image(data: str | bytes) -> np.ndarray | None:
    """Decode a base64 string (optionally a data: URL) or raw bytes into a BGR image."""
    try:
        if isinstance(data, str):
            if "," in data and data.strip().startswith("data:"):
                data = data.split(",", 1)[1]
            raw = base64.b64decode(data, validate=False)
        else:
            raw = data
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    except (binascii.Error, ValueError):
        return None


def _detect(img: np.ndarray) -> np.ndarray:
    """Return an Nx15 array of detected faces (may be empty)."""
    det = _detector_get()
    h, w = img.shape[:2]
    det.setInputSize((w, h))
    _, faces = det.detect(img)
    return faces if faces is not None else np.empty((0, 15), dtype=np.float32)


def _largest(faces: np.ndarray) -> np.ndarray:
    """Pick the largest face row (by box area)."""
    areas = faces[:, 2] * faces[:, 3]
    return faces[int(np.argmax(areas))]


def _embedding(img: np.ndarray, face_row: np.ndarray) -> np.ndarray:
    rec = _recognizer_get()
    aligned = rec.alignCrop(img, face_row)
    return rec.feature(aligned)


def _emotion(img: np.ndarray, face_row: np.ndarray) -> dict:
    x, y, bw, bh = [int(v) for v in face_row[:4]]
    x, y = max(0, x), max(0, y)
    crop = img[y : y + bh, x : x + bw]
    if crop.size == 0:
        crop = img
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, (64, 64)).astype(np.float32)
    blob = gray.reshape(1, 1, 64, 64)

    sess, (in_name, out_name) = _emotion_get()
    logits = sess.run([out_name], {in_name: blob})[0][0]
    exp = np.exp(logits - np.max(logits))
    probs = exp / exp.sum()

    scores = {name: float(probs[i]) for i, name in enumerate(_EMOTIONS)}
    confidence = round(100 * sum(scores[e] for e in _CALM))
    stress = round(100 * sum(scores[e] for e in _STRESS))
    label = max(scores, key=scores.get)
    return {
        "label": label,
        "confidence": int(np.clip(confidence, 0, 100)),
        "stress": int(np.clip(stress, 0, 100)),
        "scores": {k: round(v, 4) for k, v in scores.items()},
    }


def analyze(frame_b64: str | bytes, baseline_b64: str | bytes | None = None) -> dict:
    """Analyse one interview frame.

    Returns face count, single-person flag, emotion (confidence/stress) and,
    when a baseline image is supplied, an identity match score.
    """
    if not models_available():
        return {"ok": False, "error": "models_unavailable"}

    frame = decode_image(frame_b64)
    if frame is None:
        return {"ok": False, "error": "bad_frame"}

    faces = _detect(frame)
    face_count = int(len(faces))
    result = {
        "ok": True,
        "faceCount": face_count,
        "faceDetected": face_count > 0,
        "singlePerson": face_count == 1,
        "emotion": None,
        "match": None,
    }
    if face_count == 0:
        return result

    primary = _largest(faces)
    result["emotion"] = _emotion(frame, primary)

    if baseline_b64 is not None:
        base_img = decode_image(baseline_b64)
        if base_img is not None:
            base_faces = _detect(base_img)
            if len(base_faces) > 0:
                rec = _recognizer_get()
                emb_frame = _embedding(frame, primary)
                emb_base = _embedding(base_img, _largest(base_faces))
                cos = float(rec.match(emb_base, emb_frame, cv2.FaceRecognizerSF_FR_COSINE))
                result["match"] = {
                    "score": int(np.clip(round(cos * 100), 0, 100)),
                    "cosine": round(cos, 4),
                    "matched": bool(cos >= _MATCH_THRESHOLD),
                }
            else:
                result["match"] = {"score": None, "cosine": None, "matched": None, "note": "no_face_in_baseline"}
    return result
