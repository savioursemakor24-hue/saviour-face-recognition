"""
Face Recognition Training Script
Uses InsightFace (ArcFace via ONNX) - No TensorFlow needed!
Encodes face images from dataset and saves embeddings.
Person: Saviour Semakor
"""

import os
import sys
import json
import pickle
import numpy as np
from pathlib import Path
from PIL import Image
import cv2

# Fix OpenBLAS / memory issues on Windows
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

# Fix Windows emoji/unicode output
sys.stdout.reconfigure(encoding='utf-8')

DATASET_DIR = "dataset"
MODEL_DIR = "model"
EMBEDDINGS_FILE = os.path.join(MODEL_DIR, "face_embeddings.pkl")


def get_face_app():
    """Initialize InsightFace app."""
    import insightface
    from insightface.app import FaceAnalysis
    app = FaceAnalysis(
        name="buffalo_sc",   # lightweight model (~30MB)
        providers=["CPUExecutionProvider"]
    )
    app.prepare(ctx_id=0, det_size=(640, 640))
    return app


def load_image_rgb(image_path, max_size=1280):
    """Load image as RGB numpy array, handling webp, heic, heif too. Resizes large images."""
    img_path = str(image_path)
    suffix = Path(img_path).suffix.lower()

    # Handle HEIC/HEIF via pillow-heif
    if suffix in {".heic", ".heif"}:
        import pillow_heif
        pillow_heif.register_heif_opener()

    pil_img = Image.open(img_path).convert("RGB")

    # Resize if too large to avoid memory errors
    w, h = pil_img.size
    if max(w, h) > max_size:
        scale = max_size / max(w, h)
        new_w, new_h = int(w * scale), int(h * scale)
        pil_img = pil_img.resize((new_w, new_h), Image.LANCZOS)

    img_rgb = np.array(pil_img)
    img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
    return img_bgr


def load_and_encode_faces(app):
    """Load images from dataset and generate face embeddings."""
    all_embeddings = []
    all_labels = []
    supported_ext = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".heic", ".heif"}

    print("\n📂 Scanning dataset folder...\n")

    for person_name in os.listdir(DATASET_DIR):
        person_folder = os.path.join(DATASET_DIR, person_name)
        if not os.path.isdir(person_folder):
            continue

        print(f"👤 Processing: {person_name}")
        image_files = [
            f for f in Path(person_folder).iterdir()
            if f.suffix.lower() in supported_ext
        ]

        if not image_files:
            print(f"  ⚠️  No images found for {person_name}")
            continue

        person_embeddings = 0
        for img_path in image_files:
            try:
                print(f"  🔍 Encoding {img_path.name}...", end=" ")
                img = load_image_rgb(img_path)
                faces = app.get(img)

                if faces:
                    # Use the largest/most prominent face
                    face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
                    embedding = face.embedding
                    all_embeddings.append(embedding.tolist())
                    all_labels.append(person_name)
                    person_embeddings += 1
                    print(f"✅  (det_score={face.det_score:.2f})")
                else:
                    print("❌  No face detected")

            except Exception as e:
                print(f"❌  Error: {e}")

        print(f"  ✅ {person_embeddings}/{len(image_files)} images encoded for {person_name}\n")

    return all_embeddings, all_labels


def save_embeddings(embeddings, labels):
    """Save embeddings and labels to file."""
    os.makedirs(MODEL_DIR, exist_ok=True)
    data = {"embeddings": embeddings, "labels": labels}
    with open(EMBEDDINGS_FILE, "wb") as f:
        pickle.dump(data, f)

    unique_labels = list(set(labels))
    label_map = {i: name for i, name in enumerate(unique_labels)}
    with open(os.path.join(MODEL_DIR, "label_map.json"), "w") as f:
        json.dump(label_map, f, indent=2)

    print(f"\n💾 Saved {len(embeddings)} embeddings for {len(set(labels))} person(s)")
    print(f"📁 File: {EMBEDDINGS_FILE}")


def main():
    print("=" * 55)
    print("  🤖 SAVIOUR FACE RECOGNITION - TRAINING SYSTEM")
    print("     (InsightFace ArcFace - No TensorFlow needed)")
    print("=" * 55)

    if not os.path.exists(DATASET_DIR):
        print(f"❌ Dataset folder '{DATASET_DIR}' not found!")
        return

    print(f"\n📦 Loading InsightFace ArcFace model...")
    print("   (First run downloads ~30MB model weights)\n")
    app = get_face_app()
    print("✅ Model loaded!\n")

    embeddings, labels = load_and_encode_faces(app)

    if not embeddings:
        print("\n❌ No face embeddings were generated. Check your images.")
        return

    save_embeddings(embeddings, labels)

    print("\n" + "=" * 55)
    print("  ✅ TRAINING COMPLETE!")
    print("=" * 55)
    print(f"\n  👤 Person trained : {', '.join(set(labels))}")
    print(f"  📸 Total encodings: {len(embeddings)}")
    print(f"\n  🚀 Now run: uv run python app.py  to start the website!")
    print("=" * 55)


if __name__ == "__main__":
    main()
