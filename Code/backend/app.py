import os
import cv2
import time
import json
import math
import threading
from typing import Tuple, List

import numpy as np
from flask import Flask, Response, request, jsonify
from flask_cors import CORS

# Deep/dlib pipeline (loaded lazily, once)
_dlib_ready = False
_dlib_error = None
try:
    import dlib
    from imutils import face_utils
    from tensorflow.keras.utils import img_to_array
    from tensorflow.keras.models import load_model
    _dlib_ready = True
except Exception as e:  # If env already has these, it will succeed
    _dlib_ready = False
    _dlib_error = str(e)

app = Flask(__name__)
CORS(app)

# Absolute paths to model files in repo root
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PREDICTOR_PATH = os.path.join(ROOT_DIR, 'shape_predictor_68_face_landmarks.dat')
EMOTION_MODEL_PATH = os.path.join(ROOT_DIR, '_mini_XCEPTION.102-0.66.hdf5')

# Global state for camera and worker
cam_lock = threading.Lock()
frame_lock = threading.Lock()
cap = None
running = False
cam_index = 0

# Shared latest summary and frame
latest_summary = {"level": 0.0, "label": "Low", "faces": 0}
latest_frame = None  # BGR frame updated by camera worker

# dlib / model objects
_detector = None
_predictor = None
_emotion_classifier = None

# Rolling history for eyebrow distances
_points_history: List[float] = []
_HISTORY_MAX = 300

# Cached latest detection for overlay drawing (set during accurate pipeline)
_last_face_bb = None  # (x, y, w, h)
_last_left_eb = None  # np.ndarray of points
_last_right_eb = None  # np.ndarray of points
_last_shape_points = None  # full 68-point landmark array for overlays

# Per-feature rolling histories for normalization
_feature_histories = {}
_HISTORY_MAX_PER_FEATURE = 300

# Exponential moving average for smoothing the final stress level
_ema_level = None
_EMA_ALPHA = 0.3  # higher = more reactive, lower = smoother

# Throttling for emotion model to improve efficiency
_frame_count = 0
_last_emotion_label = "unknown"


def level_to_label(level: float) -> str:
    if level >= 0.75:
        return "High"
    if level >= 0.35:
        return "Moderate"
    return "Low"


def _ensure_models_loaded():
    global _dlib_ready, _dlib_error, _detector, _predictor, _emotion_classifier
    if not _dlib_ready:
        return False
    if _detector is not None:
        return True
    try:
        if not os.path.exists(PREDICTOR_PATH):
            raise FileNotFoundError(f"Missing predictor file: {PREDICTOR_PATH}")
        if not os.path.exists(EMOTION_MODEL_PATH):
            raise FileNotFoundError(f"Missing emotion model: {EMOTION_MODEL_PATH}")
        _detector = dlib.get_frontal_face_detector()
        _predictor = dlib.shape_predictor(PREDICTOR_PATH)
        _emotion_classifier = load_model(EMOTION_MODEL_PATH, compile=False)
        return True
    except Exception as e:
        _dlib_ready = False
        _dlib_error = str(e)
        return False


# Heuristic fallback using OpenCV Haar cascades

def _heuristic_from_opencv(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')

    faces = face_cascade.detectMultiScale(gray, 1.1, 4, minSize=(64, 64))
    if len(faces) == 0:
        return {"level": 0.0, "label": "Low", "faces": 0}

    (x, y, w, h) = faces[0]
    roi_gray = gray[y:y + h, x:x + w]
    eyes = eye_cascade.detectMultiScale(roi_gray, 1.1, 4, minSize=(20, 20))

    if len(eyes) >= 2:
        eyes_sorted = sorted(eyes, key=lambda e: e[0])[:2]
        (ex1, ey1, ew1, eh1) = eyes_sorted[0]
        (ex2, ey2, ew2, eh2) = eyes_sorted[1]
        eye_center_1 = (ex1 + ew1 / 2.0, ey1 + eh1 / 2.0)
        eye_center_2 = (ex2 + ew2 / 2.0, ey2 + eh2 / 2.0)
        eye_dist = math.hypot(eye_center_1[0] - eye_center_2[0], eye_center_1[1] - eye_center_2[1])
        scale = max(eye_dist, 1.0)
    else:
        scale = max(w * 0.5, 1.0)

    top_strip = roi_gray[: max(h // 5, 1), :]
    edges = cv2.Canny(top_strip, 50, 150)
    density = float(edges.mean()) / 255.0
    norm = min(max(density * (w / scale) * 0.5, 0.0), 3.0)
    level = max(0.0, min(1.0, math.exp(-norm)))
    label = level_to_label(level)
    return {"level": level, "label": label, "faces": len(faces)}


def _euclidean(p1: Tuple[int, int], p2: Tuple[int, int]) -> float:
    return math.hypot(float(p1[0] - p2[0]), float(p1[1] - p2[1]))


def _normalize_points(value: float, feature_key: str = "default") -> Tuple[float, str]:
    """
    Normalize a feature's value within its own rolling history, mapping changes to [0..1] stress.
    Larger deviation from recent range => higher stress. Returns (level, label).
    """
    global _feature_histories
    history = _feature_histories.get(feature_key, [])
    history.append(float(value))
    if len(history) > _HISTORY_MAX_PER_FEATURE:
        history = history[-_HISTORY_MAX_PER_FEATURE:]
    _feature_histories[feature_key] = history

    if len(history) < 5 or np.max(history) == np.min(history):
        return 0.5, "initializing"

    vmin, vmax = float(np.min(history)), float(np.max(history))
    normalized_value = abs(value - vmin) / max(abs(vmax - vmin), 1e-6)
    # Use a soft mapping; clamp to [0..1]
    stress_value = float(np.tanh(normalized_value))
    stress_value = max(0.0, min(1.0, stress_value))
    if np.isnan(stress_value):
        return 0.5, "calculating"
    label = "High" if stress_value >= 0.75 else ("Moderate" if stress_value >= 0.35 else "Low")
    return stress_value, label


# Accurate pipeline using dlib landmarks + mini_XCEPTION emotion model

def _accurate_from_dlib(frame_bgr):
    ok_models = _ensure_models_loaded()
    if not ok_models:
        return _heuristic_from_opencv(frame_bgr)

    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    detections = _detector(gray, 0)
    if len(detections) == 0:
        return {"level": 0.0, "label": "Low", "faces": 0}

    # Use first face for stress metrics; count faces for UI
    rect = detections[0]
    shape = _predictor(gray, rect)
    shape_np = face_utils.shape_to_np(shape)

    # Eyebrow landmarks
    (rBegin, rEnd) = face_utils.FACIAL_LANDMARKS_IDXS["right_eyebrow"]
    (lBegin, lEnd) = face_utils.FACIAL_LANDMARKS_IDXS["left_eyebrow"]
    right_eb = shape_np[rBegin:rEnd]
    left_eb = shape_np[lBegin:lEnd]

    # Cache for overlay drawing
    global _last_face_bb, _last_left_eb, _last_right_eb, _last_shape_points
    (fx, fy, fw, fh) = face_utils.rect_to_bb(rect)
    _last_face_bb = (int(fx), int(fy), int(fw), int(fh))
    _last_left_eb = left_eb.copy() if left_eb is not None else None
    _last_right_eb = right_eb.copy() if right_eb is not None else None
    _last_shape_points = shape_np.copy() if shape_np is not None else None

    # Distance between inner eyebrow tips (approx: right_eb[-1] to left_eb[0])
    if len(right_eb) == 0 or len(left_eb) == 0:
        return {"level": 0.0, "label": "Low", "faces": len(detections)}
    distq = _euclidean(tuple(left_eb[-1]), tuple(right_eb[0]))

    # Face box and indices for ratios
    (fx, fy, fw, fh) = _last_face_bb
    face_w = max(1.0, float(fw))
    face_h = max(1.0, float(fh))

    # Eyebrow metric: smaller distance => higher tension
    eb_norm = float(distq) / face_w
    eb_metric = max(0.0, min(1.0, 1.0 - eb_norm))
    l_eb, _ = _normalize_points(eb_metric, feature_key="eyebrow")

    # Eyes: EAR for both eyes, lower EAR => higher tension
    (leBegin, leEnd) = face_utils.FACIAL_LANDMARKS_IDXS["left_eye"]
    (reBegin, reEnd) = face_utils.FACIAL_LANDMARKS_IDXS["right_eye"]
    left_eye = shape_np[leBegin:leEnd]
    right_eye = shape_np[reBegin:reEnd]

    def _ear(eye_pts: np.ndarray) -> float:
        # EAR: (||p2-p6|| + ||p3-p5||) / (2*||p1-p4||)
        if eye_pts is None or len(eye_pts) != 6:
            return 0.3
        a = _euclidean(tuple(eye_pts[1]), tuple(eye_pts[5]))
        b = _euclidean(tuple(eye_pts[2]), tuple(eye_pts[4]))
        c = _euclidean(tuple(eye_pts[0]), tuple(eye_pts[3]))
        if c <= 1e-6:
            return 0.3
        return float((a + b) / (2.0 * c))

    ear_l = _ear(left_eye)
    ear_r = _ear(right_eye)
    eye_metric = max(0.0, min(1.0, 1.0 - float(min(ear_l, ear_r))))
    l_eye, _ = _normalize_points(eye_metric, feature_key="eyes")

    # Mouth: MAR using outer mouth
    (mBegin, mEnd) = face_utils.FACIAL_LANDMARKS_IDXS["mouth"]
    mouth = shape_np[mBegin:mEnd]

    def _mar(mouth_pts: np.ndarray) -> float:
        # MAR: average vertical distances over horizontal width
        try:
            p48, p54 = mouth[0], mouth[6]
            p50, p58 = mouth[2], mouth[10]
            p52, p56 = mouth[4], mouth[8]
            p51, p57 = mouth[3], mouth[9]
            horiz = _euclidean(tuple(p48), tuple(p54))
            vert = (_euclidean(tuple(p50), tuple(p58)) +
                    _euclidean(tuple(p52), tuple(p56)) +
                    _euclidean(tuple(p51), tuple(p57))) / 3.0
            if horiz <= 1e-6:
                return 0.4
            return float(vert / horiz)
        except Exception:
            return 0.4

    mar = _mar(mouth)
    mouth_metric = max(0.0, min(1.0, float(mar)))
    l_mouth, _ = _normalize_points(mouth_metric, feature_key="mouth")

    # Chin/Jaw drop: nose-tip to chin distance normalized by face height
    try:
        chin_pt = tuple(shape_np[8])   # index 8
        nose_tip = tuple(shape_np[33]) # index 33
        chin_dist = _euclidean(nose_tip, chin_pt) / face_h
    except Exception:
        chin_dist = 0.3
    chin_metric = max(0.0, min(1.0, float(chin_dist)))
    l_chin, _ = _normalize_points(chin_metric, feature_key="chin")

    # Fuse features
    level_fused = (0.35 * l_eb) + (0.30 * l_eye) + (0.25 * l_mouth) + (0.10 * l_chin)

    # Emotion via mini_XCEPTION (throttled)
    (x, y, w, h) = _last_face_bb
    x, y = max(0, x), max(0, y)
    roi = gray[y:y + h, x:x + w]
    try:
        global _frame_count, _last_emotion_label
        emotion_label = _last_emotion_label
        if roi.size != 0:
            _frame_count = (_frame_count + 1) % 1000000
            if (_frame_count % 5 == 0) or (emotion_label == "unknown"):
                roi_resized = cv2.resize(roi, (64, 64))
                roi_norm = roi_resized.astype("float32") / 255.0
                roi_arr = img_to_array(roi_norm)
                if roi_arr.ndim == 2:
                    roi_arr = np.expand_dims(roi_arr, axis=-1)
                roi_arr = np.expand_dims(roi_arr, axis=0)
                EMOTIONS = ["angry", "disgust", "scared", "happy", "sad", "surprised", "neutral"]
                preds = _emotion_classifier.predict(roi_arr, verbose=0)[0]
                emotion_label = EMOTIONS[int(np.argmax(preds))]
                _last_emotion_label = emotion_label
    except Exception:
        emotion_label = _last_emotion_label

    # Emotion adjustment
    is_emotion_stressed = emotion_label in ("scared", "sad")
    if is_emotion_stressed:
        level_fused = max(level_fused, 0.75)

    # EMA smoothing
    global _ema_level
    if _ema_level is None:
        _ema_level = float(level_fused)
    else:
        _ema_level = float(_EMA_ALPHA * level_fused + (1.0 - _EMA_ALPHA) * _ema_level)

    level = max(0.0, min(1.0, _ema_level))
    label = level_to_label(level)

    return {"level": float(level), "label": label, "faces": int(len(detections))}


def compute_stress_from_frame(frame):
    # Prefer accurate pipeline; fallback if unavailable
    if _ensure_models_loaded():
        return _accurate_from_dlib(frame)
    return _heuristic_from_opencv(frame)


def draw_overlays(frame_bgr):
    """Draw overlays on the frame: face rectangle + landmark contours (eyebrows, eyes, mouth, jaw) + label."""
    try:
        color = (0, 255, 0)
        # If we have a cached dlib detection, draw detailed contours
        if _last_face_bb is not None:
            (x, y, w, h) = _last_face_bb
            cv2.rectangle(frame_bgr, (x, y), (x + w, y + h), color, 1)
            try:
                if _last_shape_points is not None:
                    pts = _last_shape_points
                    # Indices blocks
                    idxs = face_utils.FACIAL_LANDMARKS_IDXS
                    # Eyebrows
                    rb = pts[idxs["right_eyebrow"][0]:idxs["right_eyebrow"][1]]
                    lb = pts[idxs["left_eyebrow"][0]:idxs["left_eyebrow"][1]]
                    if len(lb) > 0:
                        cv2.drawContours(frame_bgr, [cv2.convexHull(lb)], -1, color, 1)
                    if len(rb) > 0:
                        cv2.drawContours(frame_bgr, [cv2.convexHull(rb)], -1, color, 1)
                    # Eyes
                    le = pts[idxs["left_eye"][0]:idxs["left_eye"][1]]
                    re = pts[idxs["right_eye"][0]:idxs["right_eye"][1]]
                    if len(le) > 0:
                        cv2.polylines(frame_bgr, [le], True, color, 1)
                    if len(re) > 0:
                        cv2.polylines(frame_bgr, [re], True, color, 1)
                    # Mouth (outer)
                    mo = pts[idxs["mouth"][0]:idxs["mouth"][1]]
                    if len(mo) > 0:
                        cv2.polylines(frame_bgr, [mo], True, color, 1)
                    # Jaw line
                    jaw = pts[idxs["jaw"][0]:idxs["jaw"][1]]
                    if len(jaw) > 0:
                        cv2.polylines(frame_bgr, [jaw], False, color, 1)
                else:
                    # Fallback to cached eyebrows if available
                    if _last_left_eb is not None and len(_last_left_eb) > 0:
                        cv2.drawContours(frame_bgr, [cv2.convexHull(_last_left_eb)], -1, color, 1)
                    if _last_right_eb is not None and len(_last_right_eb) > 0:
                        cv2.drawContours(frame_bgr, [cv2.convexHull(_last_right_eb)], -1, color, 1)
            except Exception:
                pass
        else:
            # Fallback: quick Haar face for rectangle only
            gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
            face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
            faces = face_cascade.detectMultiScale(gray, 1.1, 4, minSize=(64, 64))
            if len(faces) > 0:
                (x, y, w, h) = faces[0]
                cv2.rectangle(frame_bgr, (x, y), (x + w, y + h), color, 1)
        # Annotate with current label/level
        try:
            lbl = latest_summary.get('label', '')
            lvl = int(max(0.0, min(1.0, float(latest_summary.get('level', 0.0)))) * 100)
            origin = (10, 20)
            cv2.putText(frame_bgr, f"{lbl} {lvl}%", origin,
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2, cv2.LINE_AA)
        except Exception:
            pass
    except Exception:
        # Never break the stream due to overlay issues
        pass


def camera_worker():
    global cap, running, latest_summary, latest_frame
    while running:
        if cap is None:
            time.sleep(0.05)
            continue
        ok, frame = cap.read()
        if not ok:
            time.sleep(0.01)
            continue
        frame = cv2.flip(frame, 1)
        # Optionally resize for speed
        h, w = frame.shape[:2]
        if w > 800:
            scale = 800.0 / w
            frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
        # Update summary first
        latest_summary = compute_stress_from_frame(frame)
        # Then draw overlays for display stream
        display = frame.copy()
        draw_overlays(display)
        # Update shared frame (annotated)
        with frame_lock:
            latest_frame = display
        time.sleep(0.03)  # ~30 Hz loop


@app.route('/api/start', methods=['POST'])
def start_camera():
    global cap, running, cam_index
    data = request.get_json(silent=True) or {}
    idx = int(data.get('index', cam_index))
    with cam_lock:
        if running:
            return jsonify({"status": "already_running", "index": cam_index, "dlib_ready": _ensure_models_loaded(), "dlib_error": _dlib_error}), 200
        cap_local = cv2.VideoCapture(idx)
        if not cap_local or not cap_local.isOpened():
            return jsonify({"error": f"Failed to open camera index {idx}"}), 400
        cap = cap_local
        cam_index = idx
        running = True
        t = threading.Thread(target=camera_worker, daemon=True)
        t.start()
    return jsonify({"status": "started", "index": cam_index, "dlib_ready": _ensure_models_loaded(), "dlib_error": _dlib_error}), 200


@app.route('/api/stop', methods=['POST'])
def stop_camera():
    global cap, running
    with cam_lock:
        running = False
        if cap is not None:
            try:
                cap.release()
            except Exception:
                pass
            cap = None
    return jsonify({"status": "stopped"}), 200


@app.route('/api/summary', methods=['GET'])
def get_summary():
    return jsonify(latest_summary), 200


@app.route('/api/stream')
def stream_sse():
    def gen():
        last = None
        while True:
            time.sleep(0.2)  # ~5 updates/sec
            s = latest_summary
            if s != last:
                yield f"data: {json.dumps(s)}\n\n"
                last = s
    return Response(gen(), mimetype='text/event-stream')


@app.route('/api/video')
def video_stream():
    def gen():
        boundary = b'--frame'  # must match boundary in mimetype
        while True:
            with frame_lock:
                frame = None if latest_frame is None else latest_frame.copy()
            if frame is None:
                time.sleep(0.05)
                continue
            ok, buf = cv2.imencode('.jpg', frame)
            if not ok:
                time.sleep(0.01)
                continue
            jpg = buf.tobytes()
            yield (boundary + b"\r\n"
                   b"Content-Type: image/jpeg\r\n\r\n" + jpg + b"\r\n")
            time.sleep(0.066)  # ~15 FPS
    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/')
def health():
    return jsonify({"ok": True}), 200


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)