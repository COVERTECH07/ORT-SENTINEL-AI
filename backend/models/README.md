# ML model weights

## YOLOv8 food detection

Place trained campus weights here:

```text
backend/models/ort_food_yolov8.pt
```

If missing, the service:

1. Tries `yolov8n.pt` (Ultralytics auto-download when network is available)
2. Falls back to a **deterministic professional mock** so demos never break

### Train your own campus model (you do this offline)

1. Collect plate photos from the mess (Rice, Roti, Dal, Sabzi, Paneer, …)
2. Label with [Roboflow](https://roboflow.com) or Label Studio
3. Train:

```bash
pip install ultralytics
yolo detect train data=campus_food.yaml model=yolov8n.pt epochs=50 imgsz=640
```

4. Copy `runs/detect/train/weights/best.pt` → `backend/models/ort_food_yolov8.pt`
5. Redeploy backend

## XGBoost / Prophet

No separate weight files — models train **on the fly** from `waste_entries` in the database.
Install `requirements-ml.txt` on the server for real models; otherwise historical averages are used.
