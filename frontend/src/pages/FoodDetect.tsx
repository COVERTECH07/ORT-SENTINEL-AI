import { useRef, useState } from "react";
import { Camera, ImagePlus, ScanSearch, Sparkles, Upload } from "lucide-react";
import api, { getError } from "../api";

type DetectItem = { name: string; confidence?: number; class?: string };
type DetectResult = {
  food_items?: DetectItem[];
  detections?: DetectItem[];
  model?: string;
  inference_mode?: string;
  note?: string;
  count?: number;
};

export function FoodDetect() {
  const [mealType, setMealType] = useState("lunch");
  const [preview, setPreview] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [result, setResult] = useState<DetectResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const startCamera = async () => {
    setError("");
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setError("Camera access denied or unavailable. Use photo upload instead.");
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setPreview(dataUrl);
    setBase64(dataUrl);
    stopCamera();
  };

  const onFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setPreview(dataUrl);
      setBase64(dataUrl);
      setResult(null);
    };
    reader.readAsDataURL(file);
  };

  const runDetect = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const payload = base64
        ? { meal_type: mealType, image: base64, image_base64: base64 }
        : { meal_type: mealType, image: `demo-${mealType}-${Date.now()}` };
      const { data } = await api.post("/predict/inference", payload);
      setResult(data);
    } catch (reason) {
      setError(getError(reason));
    } finally {
      setLoading(false);
    }
  };

  const items = result?.food_items ?? result?.detections ?? [];

  return (
    <div className="page-stack">
      <section className="welcome-row">
        <div>
          <div className="eyebrow dark-eyebrow">AI VISION · YOLOV8</div>
          <h1>Food detection.</h1>
          <p>Upload a plate photo or use your camera. Backend runs YOLOv8 (or demo mock if weights are offline).</p>
        </div>
      </section>

      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}

      <section className="chart-grid" style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 1fr)" }}>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Plate image</h2>
              <p>Camera capture or file upload</p>
            </div>
            <select className="select-small" value={mealType} onChange={(e) => setMealType(e.target.value)}>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <div
              style={{
                border: "1px dashed #c5d0c3",
                borderRadius: 12,
                minHeight: 260,
                background: "#f4f7f2",
                display: "grid",
                placeItems: "center",
                overflow: "hidden",
                position: "relative",
              }}
            >
              {cameraOn ? (
                <video ref={videoRef} playsInline muted style={{ width: "100%", maxHeight: 320, objectFit: "cover" }} />
              ) : preview ? (
                <img src={preview} alt="Plate preview" style={{ width: "100%", maxHeight: 320, objectFit: "contain" }} />
              ) : (
                <div style={{ textAlign: "center", color: "#7a8a78", padding: 24 }}>
                  <ImagePlus size={28} style={{ margin: "0 auto 8px" }} />
                  <div style={{ fontSize: 12 }}>No image yet</div>
                  <div style={{ fontSize: 10, marginTop: 4 }}>Open camera or upload a plate photo</div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {!cameraOn ? (
                <button className="button button-outline" type="button" onClick={() => void startCamera()}>
                  <Camera size={15} /> Open camera
                </button>
              ) : (
                <>
                  <button className="button button-dark" type="button" onClick={captureFrame}>
                    <Camera size={15} /> Capture photo
                  </button>
                  <button className="button button-outline" type="button" onClick={stopCamera}>
                    Stop camera
                  </button>
                </>
              )}
              <button className="button button-outline" type="button" onClick={() => fileRef.current?.click()}>
                <Upload size={15} /> Upload photo
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              <button className="button button-dark" type="button" disabled={loading} onClick={() => void runDetect()}>
                <ScanSearch size={15} /> {loading ? "Detecting…" : base64 ? "Detect food" : "Run demo detect"}
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 10, color: "#8a9585" }}>
              Without a photo, <b>Run demo detect</b> still calls the API with a mock seed so you can verify the pipeline.
            </p>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Detection result</h2>
              <p>Classes + confidence</p>
            </div>
          </div>
          {!result && !loading && (
            <div className="empty-state" style={{ minHeight: 200 }}>
              <Sparkles size={22} />
              <p>Results appear here after detect</p>
              <small>YOLOv8 live weights or professional mock</small>
            </div>
          )}
          {loading && (
            <div className="empty-state" style={{ minHeight: 200 }}>
              <p>Running inference…</p>
            </div>
          )}
          {result && (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={{ fontSize: 11, color: "#6b7a6c" }}>
                Model: <b>{result.model ?? "—"}</b>
                {result.inference_mode ? ` · mode: ${result.inference_mode}` : ""}
              </div>
              {result.note && (
                <div style={{ fontSize: 10, color: "#8a9585", lineHeight: 1.45 }}>{result.note}</div>
              )}
              {items.length === 0 ? (
                <div className="empty-inline">No food items returned</div>
              ) : (
                items.map((item, index) => {
                  const name = item.name || item.class || "Item";
                  const conf = typeof item.confidence === "number" ? item.confidence : 0;
                  return (
                    <div
                      key={`${name}-${index}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid #e8ebe5",
                        background: "#fafbf8",
                      }}
                    >
                      <b style={{ fontSize: 12 }}>{name}</b>
                      <span style={{ fontSize: 11, color: "#4b9661", fontWeight: 600 }}>
                        {(conf * 100).toFixed(1)}%
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
