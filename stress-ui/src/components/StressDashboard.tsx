import React from 'react';
import { Dialog, DialogContent, Box, Stack, Typography, Button } from '@mui/material';

export interface StressDashboardProps {
  open: boolean;
  onCancel: () => void;
  onPrint: () => void;
  countdown: number; // seconds remaining before auto-cancel
  summary: {
    level: number;
    label: 'Low' | 'Moderate' | 'High';
    recommendations: string[];
  };
}

// Small 384x600px printable dashboard. Printing targets only #print-area.
const StressDashboard: React.FC<StressDashboardProps> = ({ open, onCancel, onPrint, countdown, summary }) => {
  const levelPercent = Math.round(Math.max(0, Math.min(100, summary.level * 100)));

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 2, overflow: 'visible' } }}>
      {/* Print styles: only print the print area */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area { position: fixed; inset: 0; margin: auto; }
          @page { size: auto; margin: 0; }
        }
      `}</style>

      <DialogContent sx={{ p: 2 }}>
        <Box id="print-area" sx={{ width: 384, height: 600, bgcolor: '#fff', border: '1px solid #e5e5e5', borderRadius: 2, mx: 'auto', p: 2, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>
          {/* Header with title and logo placeholder */}
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" fontWeight={800}>Stress Check Result</Typography>
              <Typography variant="body2" color="text.secondary">Captured snapshot</Typography>
            </Box>
            <Box sx={{ width: 88, height: 44, border: '1px dashed #bbb', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="caption" color="text.secondary">Logo</Typography>
            </Box>
          </Stack>

          {/* Stress Level */}
          <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #eef2f7' }}>
            <Typography variant="overline" color="text.secondary">Stress Level</Typography>
            <Stack direction="row" alignItems="baseline" spacing={1}>
              <Typography variant="h3" fontWeight={800}>{levelPercent}</Typography>
              <Typography variant="h6" fontWeight={700}>/ 100</Typography>
              <Box sx={{ flex: 1 }} />
              <Typography variant="h6" fontWeight={700} color={
                summary.label === 'High' ? 'error.main' : summary.label === 'Moderate' ? 'warning.main' : 'success.main'
              }>
                {summary.label}
              </Typography>
            </Stack>
          </Box>

          {/* Recommendations */}
          <Box sx={{ mt: 2, p: 2, borderRadius: 2, border: '1px solid #eef2f7' }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>Recommendations</Typography>
            <Stack spacing={1}>
              {summary.recommendations.slice(0, 4).map((rec, idx) => (
                <Stack key={idx} direction="row" spacing={1} alignItems="flex-start">
                  <Box sx={{ width: 6, height: 6, bgcolor: '#9aa7b2', borderRadius: 999, mt: '10px' }} />
                  <Typography variant="body2" color="text.secondary">{rec}</Typography>
                </Stack>
              ))}
            </Stack>
          </Box>

          <Box sx={{ mt: 'auto', pt: 2 }}>
            <Typography variant="subtitle2" align="center" fontWeight={700}>"We Always Care For You"</Typography>
          </Box>
        </Box>

        {/* Controls: Print / Cancel with countdown */}
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mt: 2 }}>
          <Button variant="contained" color="primary" onClick={onPrint}>Print</Button>
          <Button variant="outlined" color="inherit" onClick={onCancel}>Cancel{countdown > 0 ? ` (${countdown})` : ''}</Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
};

export default StressDashboard;