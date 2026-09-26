import os
import time
import json
import urllib.request

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import cv2
from ultralytics import YOLO

# Backend Synchronization Configuration
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:5000").rstrip("/")
CENTER_ID = os.environ.get("CENTER_ID", "6ab77948e712763a816b1d7c")
SENSOR_ID = os.environ.get("SENSOR_ID", "CCTV_CAM_01")
IOT_SECRET = os.environ.get("IOT_SECRET", "")

# Load IOT_SECRET from environment or backend/.env if available
if not IOT_SECRET:
    for env_candidate in [
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.path.dirname(__file__), "..", "backend", ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env"),
    ]:
        if os.path.isfile(env_candidate):
            try:
                with open(env_candidate, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("IOT_SECRET=") and not line.startswith("#"):
                            IOT_SECRET = line.split("=", 1)[1].strip().strip('"').strip("'")
                            break
            except Exception:
                pass
            if IOT_SECRET:
                break

# Load YOLO model
model = YOLO("yolo11s.pt")

# Open webcam using DirectShow backend (more stable on Windows)
cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
cap.set(cv2.CAP_PROP_FPS, 30)

if not cap.isOpened():
    print("Camera open nahi ho raha.")
    exit()

# Warm-up: discard first few frames so camera exposure settles
print("Camera warming up...")
time.sleep(2)
for _ in range(5):
    cap.read()

print("Queue Flow - Crowd Counter started.")
print("Press Q to exit.")

fail_count = 0
MAX_FAILS = 10
last_synced_crowd = None
last_sync_attempt_time = 0.0
SYNC_RETRY_COOLDOWN = 1.0  # seconds to wait before retrying after a failed sync

while True:
    ret, frame = cap.read()

    if not ret:
        fail_count += 1
        print(f"Frame read nahi hua. ({fail_count}/{MAX_FAILS})")
        if fail_count >= MAX_FAILS:
            print("Too many frame errors. Exiting.")
            break
        time.sleep(0.1)
        continue
    fail_count = 0  # reset on success

    # Track only persons (class 0)
    results = model.track(
        frame,
        persist=True,
        classes=[0],
        tracker="bytetrack.yaml",
        conf=0.5,
        verbose=False
    )

    result = results[0]

    # Draw tracking bounding boxes and IDs on the frame
    annotated_frame = result.plot()

    # Safely extract current tracking IDs
    track_ids = []
    if result.boxes is not None and result.boxes.id is not None:
        track_ids = result.boxes.id.int().cpu().tolist()

    # Current crowd count based on visible tracked person IDs
    current_crowd = len(track_ids)

    # Synchronize crowd count with backend only when count changes (with retry cooldown on failure)
    current_time = time.time()
    if current_crowd != last_synced_crowd and (current_time - last_sync_attempt_time >= SYNC_RETRY_COOLDOWN):
        last_sync_attempt_time = current_time
        try:
            payload = json.dumps({
                "centerId": CENTER_ID,
                "absoluteCount": current_crowd,
                "sensorId": SENSOR_ID
            }).encode("utf-8")

            req = urllib.request.Request(
                f"{BACKEND_URL}/api/iot/crowd/absolute",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-iot-secret": IOT_SECRET
                },
                method="POST"
            )

            with urllib.request.urlopen(req, timeout=2.0) as response:
                if 200 <= response.status < 300:
                    last_synced_crowd = current_crowd
                    print(f"[Backend] Crowd synchronized: {current_crowd}")
                else:
                    print(f"[Backend] Sync failed: HTTP {response.status}")
        except Exception as e:
            print(f"[Backend] Sync failed: {e}")

    # Display crowd count
    cv2.putText(
        annotated_frame,
        f"CURRENT CROWD: {current_crowd}",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (0, 255, 0),
        2
    )

    # Display current tracking IDs for debugging
    cv2.putText(
        annotated_frame,
        f"TRACKED IDs: {track_ids}",
        (20, 80),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 255, 0),
        2
    )

    # Show camera
    cv2.imshow(
        "Queue Flow - Crowd Counter",
        annotated_frame
    )

    # Press Q to exit
    if cv2.waitKey(1) & 0xFF in (ord("q"), ord("Q")):
        break

cap.release()
cv2.destroyAllWindows()