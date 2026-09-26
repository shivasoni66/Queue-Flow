import cv2
from ultralytics import YOLO

# Load YOLO model
model = YOLO("yolo11s.pt")

# Open webcam
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("Camera open nahi ho raha.")
    exit()

print("Queue Flow - Crowd Counter started.")
print("Press Q to exit.")

while True:
    ret, frame = cap.read()

    if not ret:
        print("Frame read nahi hua.")
        break

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