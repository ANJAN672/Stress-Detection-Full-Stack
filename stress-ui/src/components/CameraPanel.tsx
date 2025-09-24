import React, { useEffect, useRef, useState } from 'react';
import { Box, Paper, Stack, Typography, Button, Alert, Chip, TextField } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';

interface Props {
  onAnalyze: (snapshotUrl?: string) => void;
}

// Backend endpoints
const API_BASE = 'http://localhost:8000';

const CameraPanel: React.FC<Props> = ({ onAnalyze }) => {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facesCount, setFacesCount] = useState(0);
  const [camIndex, setCamIndex] = useState<number>(0);
  const esRef = useRef<EventSource | null>(null);

  // Freeze flow state
  const [isFreezing, setIsFreezing] = useState(false);
  const [freezeCountdown, setFreezeCountdown] = useState(5);
  const [frozen, setFrozen] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);

  // Connect to SSE and forward updates to the rest of the app via the existing event bus
  const connectSSE = () => {
    if (esRef.current) return;
    const es = new EventSource(`${API_BASE}/api/stream`);
    es.onopen = () => {
      setError(null);
    };
    es.onerror = () => {
      setError('Lost connection to backend stream. Is the backend running?');
    };
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data) as { level: number; label: 'Low'|'Moderate'|'High'; faces?: number };
        if (typeof d.level === 'number') {
          setFacesCount(d.faces ?? 0);
          // Reuse existing event bus so App.tsx stays unchanged
          window.dispatchEvent(new CustomEvent('backend:summary', { detail: d }));
        }
      } catch {}
    };
    esRef.current = es;
  };

  const disconnectSSE = () => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  };

  const startBackend = async () => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: camIndex }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error || 'Failed to start backend');
      setRunning(true);
      connectSSE();
    } catch (e: any) {
      setError(e?.message || 'Failed to start backend');
      setRunning(false);
    }
  };

  const switchCamera = async (idx: number) => {
    setCamIndex(idx);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: idx }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js?.error || `Failed to switch to camera ${idx}`);
      setRunning(true);
      connectSSE();
    } catch (e: any) {
      setError(e?.message || `Failed to switch to camera ${idx}`);
    }
  };

  const stopBackend = async () => {
    try {
      await fetch(`${API_BASE}/api/stop`, { method: 'POST' });
    } catch {}
    setRunning(false);
    disconnectSSE();
    setFacesCount(0);
  };

  // Listen for a global unfreeze event from the app
  useEffect(() => {
    const onUnfreeze = () => { setIsFreezing(false); setFreezeCountdown(5); setFrozen(false); };
    window.addEventListener('ui:unfreeze', onUnfreeze);
    return () => window.removeEventListener('ui:unfreeze', onUnfreeze);
  }, []);

  // cleanup on unmount
  useEffect(() => () => { stopBackend(); }, []);

  const startFreezeCountdown = () => {
    if (!running || isFreezing || frozen) return;
    setIsFreezing(true);
    setFreezeCountdown(5);
    const interval = setInterval(() => {
      setFreezeCountdown((s) => {
        if (s <= 1) {
          clearInterval(interval);
          setIsFreezing(false);
          setFrozen(true);
          // We could capture a snapshot here if CORS allows; for now just trigger analyze
          onAnalyze();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  return (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid #eee', height: '100%' }}>
      <Stack spacing={1}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" fontWeight={700}>Backend Camera</Typography>
          <Chip size="small" label={`${facesCount} face${facesCount === 1 ? '' : 's'}`} />
          <Chip size="small" color={running ? 'success' : 'default'} label={running ? 'Running' : 'Stopped'} />
          <Box sx={{ flex: 1 }} />
          {!running ? (
            <Button startIcon={<PlayArrowIcon />} variant="contained" onClick={startBackend}>Start</Button>
          ) : (
            <Button startIcon={<StopIcon />} color="inherit" variant="outlined" onClick={stopBackend}>Stop</Button>
          )}
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}

        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            label="Camera Index"
            type="number"
            size="small"
            value={camIndex}
            onChange={(e) => setCamIndex(parseInt(e.target.value || '0', 10))}
            inputProps={{ min: 0, step: 1 }}
            sx={{ width: 160 }}
          />
          <Button variant="outlined" size="small" onClick={() => switchCamera(0)}>Laptop Cam</Button>
          <Button variant="outlined" size="small" onClick={() => switchCamera(1)}>USB Cam</Button>
          <Typography variant="body2" color="text.secondary">
            Tip: 0 = default webcam. Increase for external cameras.
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" size="small" disabled={!running || isFreezing || frozen} onClick={startFreezeCountdown}>
            {isFreezing ? `Capturing in ${freezeCountdown}s` : 'Capture & Freeze (5s)'}
          </Button>
        </Stack>

        <Box sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden', aspectRatio: '4 / 3', bgcolor: '#000' }}>
          {/* Show the exact same OpenCV camera stream from backend as MJPEG */}
          {running && !frozen ? (
            <img
              ref={imgRef}
              src={`${API_BASE}/api/video`}
              alt="Backend Camera"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb' }}>
              <Typography variant="body2" align="center">{frozen ? 'Frozen' : 'Start to view backend camera stream'}</Typography>
            </Box>
          )}

          {/* Overlay countdown */}
          {isFreezing && (
            <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.35)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="h4" fontWeight={800}>{freezeCountdown}</Typography>
            </Box>
          )}
        </Box>
      </Stack>
    </Paper>
  );
};

export default CameraPanel;