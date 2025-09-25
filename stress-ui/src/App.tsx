import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Container, Grid, Paper, Typography, Divider, Stack, Button, Chip, LinearProgress } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import PsychologyIcon from '@mui/icons-material/Psychology';
import HistoryIcon from '@mui/icons-material/History';
import CameraPanel from './components/CameraPanel';
import StressPanel, { StressSummary } from './components/StressPanel';
import HistoryPanel, { HistoryItem } from './components/HistoryPanel';
import StressDashboard from './components/StressDashboard';

function App() {
  const [summary, setSummary] = useState<StressSummary>({ level: 0.1, label: 'Low', recommendations: ['Initializing...'] });
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Popup state
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [countdown, setCountdown] = useState(10); // auto-cancel in 10s
  const lastSummaryAtRef = useRef<number | null>(null);
  const freezeHandledRef = useRef(false);
  const countdownTimerRef = useRef<number | null>(null);
  const monitorTimerRef = useRef<number | null>(null);
  const dashboardOpenRef = useRef(false);

  // Keep a ref of current dialog state to react to backend reset immediately
  useEffect(() => { dashboardOpenRef.current = dashboardOpen; }, [dashboardOpen]);

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

        // Mark last time we received data; stream is active
        lastSummaryAtRef.current = Date.now();

        // If dialog is open and backend resumed/reset, close immediately (sync <10s)
        if (dashboardOpenRef.current) {
          handleCancel();
        }

        // Reset freeze flag when stream resumes
        if (freezeHandledRef.current) freezeHandledRef.current = false;
      }
    };
    window.addEventListener('backend:summary', onSummary as EventListener);
    return () => window.removeEventListener('backend:summary', onSummary as EventListener);
  }, []);

  // Monitor stream; only show dashboard on manual request, not automatically
  // Monitor stream; if no updates for ~5s, consider "freeze" and show dashboard once
  useEffect(() => {
    const FREEZE_MS = 5000; // backend capture window
    const POLL_MS = 50;    // tight polling for minimal latency

    if (monitorTimerRef.current) return;
    monitorTimerRef.current = window.setInterval(() => {
      const last = lastSummaryAtRef.current;
      if (!last) return;
      const silentMs = Date.now() - last;
      if (silentMs >= FREEZE_MS && !freezeHandledRef.current && !dashboardOpen) {
        freezeHandledRef.current = true; // show once per freeze
        openDashboard();
      }
    }, POLL_MS);
    return () => {
      if (monitorTimerRef.current) {
        clearInterval(monitorTimerRef.current);
        monitorTimerRef.current = null;
      }
    };
  }, [dashboardOpen]);

  const openDashboard = () => {
    setDashboardOpen(true);
    setCountdown(10);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          // auto-cancel
          handleCancel();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const handleCancel = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setDashboardOpen(false);
  };

  const handlePrint = () => {
    // Trigger browser print for the dashboard content only
    window.print();
  };

  const resetHistory = () => setHistory([]);

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 3, border: '1px solid #eee' }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Box 
            component="img"
            src="/shridevi-logo.png"
            alt="Shridevi Education"
            sx={{ width: 60, height: 60, objectFit: 'contain' }}
          />
          <VideocamIcon color="primary" />
          <Typography variant="h5" fontWeight={700}>Stress Detection using AI</Typography>
          <Chip label="Real-time AI Analysis" color="secondary" variant="outlined" size="small" sx={{ ml: 'auto' }} />
        </Stack>
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <CameraPanel onAnalyze={() => {}} />
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
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>Live backend analysis ~2 FPS - Reports auto-generate when paused</Typography>
      </Box>

      {/* Mini printable dashboard popup */}
      <StressDashboard
        open={dashboardOpen}
        onCancel={handleCancel}
        onPrint={handlePrint}
        countdown={countdown}
        summary={summary}
      />
    </Container>
  );
}

export default App;