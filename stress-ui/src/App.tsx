import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Container, Grid, Paper, Typography, Divider, Stack, Button, Chip, LinearProgress } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import PsychologyIcon from '@mui/icons-material/Psychology';
import HistoryIcon from '@mui/icons-material/History';
import CameraPanel from './components/CameraPanel';
import StressPanel, { StressSummary } from './components/StressPanel';
import HistoryPanel, { HistoryItem } from './components/HistoryPanel';
import ReceiptPopup from './components/ReceiptPopup';

function App() {
  const [summary, setSummary] = useState<StressSummary>({ level: 0.1, label: 'Low', recommendations: ['Initializing...'] });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showReceipt, setShowReceipt] = useState(false);

  // Consume backend summaries
  useEffect(() => {
    const onSummary = (e: Event) => {
      const d = (e as CustomEvent).detail as { level: number; label: 'Low'|'Moderate'|'High' };
      if (d && typeof d.level === 'number') {
        setSummary({
          level: d.level,
          label: d.label,
          recommendations: d.label === 'High'
            ? ['Pause and take 5 deep breaths', 'Relax your shoulders and jaw', 'Try a quick 2-minute mindfulness']
            : d.label === 'Moderate'
            ? ['Take a short walk', 'Slow, steady breathing for 60s', 'Adjust your sitting posture']
            : ['Great! Keep a regular rhythm', 'Stay hydrated', 'Maintain focus with short breaks'],
        });
        setHistory(prev => [{ timestamp: new Date().toISOString(), level: d.level, label: d.label }, ...prev].slice(0, 10));
      }
    };
    window.addEventListener('backend:summary', onSummary as EventListener);
    return () => window.removeEventListener('backend:summary', onSummary as EventListener);
  }, []);

  const resetHistory = () => setHistory([]);

  const handleAnalyze = () => {
    // Camera froze and analysis point reached → show receipt popup
    setShowReceipt(true);
  };

  const handleReceiptClose = (reason: 'print' | 'cancel' | 'auto_cancel') => {
    setShowReceipt(false);
    // Unfreeze camera
    window.dispatchEvent(new Event('ui:unfreeze'));
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 3, border: '1px solid #eee' }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <VideocamIcon color="primary" />
          <Typography variant="h5" fontWeight={700}>Stress Detection Dashboard</Typography>
          <Chip label="Real-time" color="secondary" variant="outlined" size="small" sx={{ ml: 'auto' }} />
        </Stack>
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <CameraPanel onAnalyze={handleAnalyze} />
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ p: 2, borderRadius: 3, border: '1px solid #eee' }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <PsychologyIcon color="primary" />
              <Typography variant="h6" fontWeight={700}>Current Stress</Typography>
              <Box sx={{ flex: 1 }} />
            </Stack>
            <StressPanel summary={summary} />
            <Divider sx={{ my: 2 }} />
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <HistoryIcon color="primary" />
              <Typography variant="h6" fontWeight={700}>Recent Checks</Typography>
              <Box sx={{ flex: 1 }} />
              <Button size="small" onClick={resetHistory}>Clear</Button>
            </Stack>
            <HistoryPanel items={history} />
          </Paper>
        </Grid>
      </Grid>

      <Box sx={{ mt: 2 }}>
        <LinearProgress variant="determinate" value={Math.min(100, summary.level * 100)} sx={{ height: 8, borderRadius: 999 }} />
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>Live backend analysis ~2 FPS</Typography>
      </Box>

      {/* Receipt Popup */}
      <ReceiptPopup open={showReceipt} summary={summary} onClose={handleReceiptClose} />
    </Container>
  );
}

export default App;