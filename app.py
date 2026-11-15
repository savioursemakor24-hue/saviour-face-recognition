"""
Face Recognition Web App - Flask Backend
Uses InsightFace ArcFace (ONNX) - No TensorFlow needed!
Recognizes Saviour Semakor.
"""

import os
# Fix OpenBLAS / memory issues on Windows - MUST BE SET BEFORE NUMPY/CV2 IMPORT
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

import io
import pickle
import base64
import numpy as np
import cv2
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from PIL import Image

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

EMBEDDINGS_FILE = "model/face_embeddings.pkl"
THRESHOLD = 0.40   # cosine-distance threshold for InsightFace ArcFace

face_app = None
face_data = None


def get_face_app():
    import insightface
    from insightface.app import FaceAnalysis
    fa = FaceAnalysis(
        name="buffalo_sc",
        providers=["CPUExecutionProvider"]
    )
    fa.prepare(ctx_id=0, det_size=(640, 640))
    return fa


def load_face_data():
    global face_data, face_app
    print("📦 Loading InsightFace model...")
    face_app = get_face_app()
    print("✅ InsightFace model ready!")

    if os.path.exists(EMBEDDINGS_FILE):
        with open(EMBEDDINGS_FILE, "rb") as f:
            face_data = pickle.load(f)
        print(f"✅ Loaded {len(face_data['labels'])} encoding(s)")
        print(f"✅ Known: {set(face_data['labels'])}")
    else:
        print("⚠️  No embeddings found. Run train.py first!")


def cosine_distance(a, b):
    a, b = np.array(a), np.array(b)
    return 1 - np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))


def pil_to_bgr(pil_img, max_size=1280):
    # Resize if too large to avoid memory errors
    w, h = pil_img.size
    if max(w, h) > max_size:
        scale = max_size / max(w, h)
        pil_img = pil_img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    rgb = np.array(pil_img.convert("RGB"))
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def recognize_face(image_input):
    if face_data is None or not face_data["embeddings"]:
        return {"name": "Unknown", "confidence": 0, "matched": False,
                "message": "⚠️ No trained faces found! Run train.py first."}

    try:
        if isinstance(image_input, Image.Image):
            pil_img = image_input
        else:
            pil_img = Image.open(image_input).convert("RGB")
        img_bgr = pil_to_bgr(pil_img)
        faces = face_app.get(img_bgr)

        if not faces:
            return {"name": "No Face Detected", "confidence": 0, "matched": False,
                    "message": "❌ No face found in the image. Try a clearer photo."}

        # Use the largest detected face
        face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
        query_emb = face.embedding

        best_name = "Unknown"
        best_dist = float("inf")

        for stored_emb, label in zip(face_data["embeddings"], face_data["labels"]):
            dist = cosine_distance(query_emb, stored_emb)
            if dist < best_dist:
                best_dist = dist
                best_name = label

        similarity = round(max(0.0, min(100.0, (1 - best_dist) * 100)), 2)
        det_score = round(float(getattr(face, 'det_score', 0.95)) * 100, 1)
        bbox = [int(v) for v in face.bbox.tolist()] if hasattr(face, 'bbox') else None

        # Return rich biometric metadata
        result_payload = {
            "confidence": similarity,
            "det_score": det_score,
            "cosine_dist": round(float(best_dist), 4),
            "bbox": bbox,
            "image_size": [pil_img.width, pil_img.height],
            "total_encodings": len(face_data["labels"])
        }

        if best_dist <= THRESHOLD:
            display_name = best_name.replace("_", " ")
            result_payload.update({
                "name": display_name,
                "matched": True,
                "status": "VERIFIED",
                "message": f"Biometric Match Confirmed: {display_name}"
            })
        else:
            result_payload.update({
                "name": "Unknown Subject",
                "matched": False,
                "status": "UNMATCHED",
                "message": "Subject not found in authorized database"
            })

        return result_payload

    except Exception as e:
        return {"name": "Error", "confidence": 0, "matched": False,
                "message": f"❌ {str(e)}"}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/recognize", methods=["POST"])
def recognize():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400
    file = request.files["image"]
    try:
        img = Image.open(file.stream).convert("RGB")
        return jsonify(recognize_face(img))
    except Exception as e:
        return jsonify({"error": f"Failed to process image: {str(e)}"}), 400


@app.route("/recognize_base64", methods=["POST"])
def recognize_base64():
    data = request.get_json()
    if not data or "image" not in data:
        return jsonify({"error": "No image data"}), 400
    try:
        image_data = data["image"]
        if "," in image_data:
            image_data = image_data.split(",")[1]
        image_bytes = base64.b64decode(image_data)
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return jsonify(recognize_face(img))
    except Exception as e:
        return jsonify({"error": f"Failed to decode image: {str(e)}"}), 400


@app.route("/status")
def status():
    if face_data:
        return jsonify({
            "status": "ready",
            "total_encodings": len(face_data["labels"]),
            "known_persons": list(set(face_data["labels"])),
        })
    return jsonify({"status": "not_trained", "message": "Run train.py first"})


load_face_data()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n🌐 Starting Face Recognition Web App on port {port}...")
    print(f"📡 Open: http://localhost:{port}")
    app.run(debug=False, host="0.0.0.0", port=port)
