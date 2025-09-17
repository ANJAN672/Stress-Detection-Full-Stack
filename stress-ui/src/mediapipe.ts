// Lightweight loader for MediaPipe FaceMesh via CDN and a helper to create an instance
// Avoids npm installation; works in Vite/React with TypeScript using loose types.

export type FaceMeshResult = {
  multiFaceLandmarks?: { x: number; y: number; z: number }[][];
};

export async function loadFaceMesh(): Promise<any> {
  const w = window as any;
  if (w.FaceMesh) return w.FaceMesh;

  // Inject script once
  if (!w.__mpFaceMeshLoading) {
    w.__mpFaceMeshLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load MediaPipe FaceMesh'));
      document.head.appendChild(script);
    });
  }
  await w.__mpFaceMeshLoading;
  return (window as any).FaceMesh;
}

export async function createFaceMesh(onResults: (res: any) => void): Promise<any> {
  const FaceMeshCtor = await loadFaceMesh();
  const faceMesh = new FaceMeshCtor({
    locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });
  faceMesh.setOptions({
    maxNumFaces: 2,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  faceMesh.onResults(onResults);
  return faceMesh;
}