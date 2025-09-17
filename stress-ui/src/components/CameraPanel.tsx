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

  const stopBackend = async () => {
    try {
      await fetch(`${API_BASE}/api/stop`, { method: 'POST' });
    } catch {}
    setRunning(false);
    disconnectSSE();
    setFacesCount(0);
  };

  useEffect(() => () => {
    // cleanup on unmount
    stopBackend();
  }, []);

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
          <Typography variant="body2" color="text.secondary">
            Tip: 0 = default webcam. Increase for external cameras.
          </Typography>
        </Stack>

        <Box sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden', aspectRatio: '4 / 3', bgcolor: '#000' }}>
          {/* Show the exact same OpenCV camera stream from backend as MJPEG */}
          {running ? (
            <img
              src={`${API_BASE}/api/video`}
              alt="Backend Camera"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb' }}>
              <Typography variant="body2" align="center">Start to view backend camera stream</Typography>
            </Box>
          )}
        </Box>
      </Stack>
    </Paper>
  );
};

export default CameraPanel;