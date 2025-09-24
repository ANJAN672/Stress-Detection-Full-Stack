import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogContent, Stack, Typography } from '@mui/material';
import { StressSummary } from './StressPanel';

export type ReceiptCloseReason = 'print' | 'cancel' | 'auto_cancel';

interface Props {
  open: boolean;
  summary: StressSummary;
  onClose: (reason: ReceiptCloseReason) => void;
  logoUrl?: string; // optional logo (top-right)
  decisionSeconds?: number; // default 10
}

// Print a specific node by opening a new window sized to the receipt and calling print
const printNode = (node: HTMLElement) => {
  const html = node.outerHTML;
  const printWin = window.open('', 'printwin', 'width=420,height=800');
  if (!printWin) return;
  const doc = printWin.document;
  doc.open();
  doc.write(`<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Receipt</title>
    <style>
      /* Ensure exact size: 384x600 px */
      @page { size: 384px 600px; margin: 0; }
      html, body { margin: 0; padding: 0; }
      /* Prevent page scaling */
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      /* Root wrapper to center the receipt for screen preview */
      .print-root { width: 384px; height: 600px; margin: 0; }
      /* Inherit fonts */
      * { font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    </style>
  </head>
  <body>
    <div class="print-root">${html}</div>
  </body>
  </html>`);
  doc.close();
  // Delay a tick to allow layout
  setTimeout(() => {
    printWin.focus();
    printWin.print();
    // Close automatically after printing
    setTimeout(() => printWin.close(), 300);
  }, 100);
};

const ReceiptPopup: React.FC<Props> = ({ open, summary, onClose, logoUrl, decisionSeconds = 10 }) => {
  const [secondsLeft, setSecondsLeft] = useState(decisionSeconds);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setSecondsLeft(decisionSeconds);
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          onClose('auto_cancel');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [open, decisionSeconds, onClose]);

  const percent = useMemo(() => Math.round(summary.level * 100), [summary.level]);

  const handlePrint = () => {
    if (contentRef.current) {
      printNode(contentRef.current);
      onClose('print');
    }
  };

  const handleCancel = () => onClose('cancel');

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth={false} PaperProps={{ sx: { borderRadius: 2, p: 0 } }}>
      <DialogContent sx={{ p: 2 }}>
        {/* Fixed-size receipt container */}
        <Box
          ref={contentRef}
          sx={{
            width: 384,
            height: 600,
            bgcolor: '#fff',
            color: '#111',
            border: '1px dashed #ccc',
            borderRadius: 1,
            boxShadow: 'none',
            px: 2,
            py: 1.5,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">Stress Report</Typography>
              <Typography variant="h6" fontWeight={800}>Instant Assessment</Typography>
            </Box>
            <Box sx={{ width: 64, height: 32, border: '1px dashed #ddd', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : (
                <Typography variant="caption" color="text.secondary">Logo</Typography>
              )}
            </Box>
          </Stack>

          {/* Stress Level Card */}
          <Box sx={{ border: '1px solid #eee', borderRadius: 1, p: 1.5, mb: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="subtitle2" color="text.secondary">Stress Level</Typography>
              <Box sx={{ flex: 1 }} />
              <Typography variant="h5" fontWeight={800}>{percent}%</Typography>
            </Stack>
            <Box sx={{ mt: 1, height: 10, width: '100%', borderRadius: 999, bgcolor: '#f1f1f4', overflow: 'hidden' }}>
              <Box sx={{ height: '100%', width: `${percent}%`, bgcolor: summary.label === 'High' ? '#d32f2f' : summary.label === 'Moderate' ? '#ed6c02' : '#2e7d32' }} />
            </Box>
            <Typography variant="subtitle2" sx={{ mt: 0.5, textAlign: 'right', fontWeight: 700 }}>{summary.label}</Typography>
          </Box>

          {/* Recommendations */}
          <Box sx={{ border: '1px solid #eee', borderRadius: 1, p: 1.5, flex: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Recommendations</Typography>
            <Stack spacing={0.75}>
              {summary.recommendations.map((rec, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
                  <Box sx={{ mt: '4px', width: 6, height: 6, borderRadius: 999, bgcolor: '#673ab7' }} />
                  <Typography variant="body2" sx={{ lineHeight: 1.3 }}>{rec}</Typography>
                </Stack>
              ))}
            </Stack>
          </Box>

          {/* Footer slogan */}
          <Box sx={{ mt: 1, pt: 1, borderTop: '1px dashed #eee' }}>
            <Typography variant="subtitle2" align="center" fontWeight={700}>
              "We Always Care For You"
            </Typography>
          </Box>
        </Box>

        {/* Actions with countdown */}
        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end" sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">Auto-cancel in {secondsLeft}s</Typography>
          <Button onClick={handleCancel} color="inherit" variant="outlined" size="small">Cancel</Button>
          <Button onClick={handlePrint} variant="contained" size="small">Print</Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
};

export default ReceiptPopup;