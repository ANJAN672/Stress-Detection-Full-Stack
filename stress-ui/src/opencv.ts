// Lightweight OpenCV.js loader and cascade helper
// Loads OpenCV.js from CDN and ensures a Haar cascade is available for face detection.

export async function loadOpenCV(): Promise<void> {
  const w = window as any;
  if (w.cv && (w.cv.getBuildInformation || w.cv.Mat)) {
    // Already loaded and initialized
    return;
  }

  // Avoid duplicate script injection
  if (!w.__opencvScriptLoading) {
    w.__opencvScriptLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.x/opencv.js';
      script.async = true;
      script.onload = () => {
        const cv = (window as any).cv;
        if (cv && typeof cv.getBuildInformation === 'function') {
          // Some builds are ready immediately
          resolve();
          return;
        }
        if (cv) {
          cv['onRuntimeInitialized'] = () => resolve();
        } else {
          resolve();
        }
      };
      script.onerror = () => reject(new Error('Failed to load OpenCV.js'));
      document.head.appendChild(script);
    });
  }

  await w.__opencvScriptLoading;
}

export async function loadFaceCascade(cascadeName = 'haarcascade_frontalface_default.xml'): Promise<any> {
  await loadOpenCV();
  const cv = (window as any).cv;

  // If file already exists in FS, just load classifier
  const classifier = new cv.CascadeClassifier();
  try {
    classifier.load(cascadeName);
    // If it loaded successfully, return
    if (!classifier.empty()) return classifier;
  } catch {
    // continue to fetch
  }

  // Fetch cascade from OpenCV repo
  const url = 'https://raw.githubusercontent.com/opencv/opencv/4.x/data/haarcascades/haarcascade_frontalface_default.xml';
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Failed to fetch cascade file');
  const text = await resp.text();
  const data = new TextEncoder().encode(text);

  // Create file in the OpenCV FS
  try {
    cv.FS_createDataFile('/', cascadeName, data, true, false, false);
  } catch {
    // might already exist
  }

  classifier.load(cascadeName);
  if (classifier.empty()) throw new Error('Failed to load cascade into OpenCV');
  return classifier;
}

export type Detection = { x: number; y: number; width: number; height: number };

export function detectFaces(canvasEl: HTMLCanvasElement, classifier: any): Detection[] {
  const cv = (window as any).cv;
  const src = cv.imread(canvasEl); // RGBA
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

  const faces = new cv.RectVector();
  const msize = new cv.Size(64, 64);
  classifier.detectMultiScale(gray, faces, 1.1, 3, 0, msize);

  const out: Detection[] = [];
  for (let i = 0; i < faces.size(); i++) {
    const r = faces.get(i);
    out.push({ x: r.x, y: r.y, width: r.width, height: r.height });
  }

  // Cleanup to avoid memory leaks
  src.delete();
  gray.delete();
  faces.delete();
  msize.delete();

  return out;
}