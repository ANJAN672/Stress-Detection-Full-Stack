import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, Box, Stack, Typography, Button, LinearProgress, Chip, Divider, Alert } from '@mui/material';
import { Psychology, MonitorHeart, Print, Close } from '@mui/icons-material';

export interface StressDashboardProps {
  open: boolean;
  onCancel: () => void;
  onPrint: () => void;
  countdown: number; // seconds remaining before auto-cancel
  summary: {
    level: number;
    label: 'Low' | 'Moderate' | 'High';
    faces?: number;
    emotion?: string;
    timestamp?: string;
    recommendations?: string[];
  };
}

// Enhanced stress dashboard with real-time analysis and improved accuracy
const StressDashboard: React.FC<StressDashboardProps> = ({ open, onCancel, onPrint, countdown, summary }) => {
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleString());
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const levelPercent = Math.round(Math.max(0, Math.min(100, summary.level * 100)));
  
  // Enhanced recommendations based on stress level
  const getRecommendations = (label: string): string[] => {
    const baseRecommendations = {
      'Low': [
        'Maintain current stress management practices',
        'Continue regular breathing exercises',
        'Keep up good work-life balance',
        'Stay hydrated and maintain good posture'
      ],
      'Moderate': [
        'Take short breaks every 30 minutes',
        'Practice deep breathing for 5 minutes',
        'Consider light stretching or walking',
        'Reduce caffeine intake if possible'
      ],
      'High': [
        'Take an immediate 10-minute break',
        'Practice mindfulness or meditation',
        'Contact a healthcare professional if persistent',
        'Consider adjusting workload or environment'
      ]
    };
    
    return baseRecommendations[label as keyof typeof baseRecommendations] || baseRecommendations['Low'];
  };

  const recommendations = summary.recommendations || getRecommendations(summary.label);
  
  // Color coding based on stress level
  const getStressColor = (label: string) => {
    switch (label) {
      case 'High': return '#f44336';
      case 'Moderate': return '#ff9800';
      case 'Low': return '#4caf50';
      default: return '#2196f3';
    }
  };

  const stressColor = getStressColor(summary.label);

  return (
    <Dialog 
      open={open} 
      onClose={onCancel} 
      fullWidth 
      maxWidth="md" 
      PaperProps={{ sx: { borderRadius: 3, overflow: 'visible', maxHeight: '90vh' } }}
    >
      {/* Print styles: only print the print area - single page */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area { 
            position: fixed !important; 
            top: 0 !important; 
            left: 0 !important; 
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            padding: 15mm !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            page-break-after: avoid !important;
          }
          @page { 
            size: A4 !important; 
            margin: 0 !important; 
            padding: 0 !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <DialogContent sx={{ p: 0 }}>
        <Box 
          id="print-area" 
          sx={{ 
            bgcolor: '#fff', 
            mx: 'auto', 
            pt: 0,
            px: 1,
            pb: 1,
            display: 'flex', 
            flexDirection: 'column',
            minHeight: 600
          }}
        >
          {/* Header */}
          <Stack alignItems="center" spacing={1} sx={{ mb: 1, mt: -8, mr:-10 }}>
            {/* Brand Name and Logo on same line */}
            <Stack direction="row" alignItems="center" spacing={2} justifyContent="center">
              <Typography variant="h3" fontWeight={800} color="primary.main">
                SHRIDEVI EDUCATION
              </Typography>
              
              <Box 
                component="img"
                src="/shridevi-logo.png"
                alt="Shridevi Education"
                sx={{ 
                  width: 280, 
                  height: 280, 
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                }}
              />
            </Stack>
            
            {/* Title below logo */}
            <Typography variant="h4" fontWeight={800} color="primary.main" sx={{ textAlign: 'left', width: '100%', paddingLeft: -1 }}>
              AI STRESS DETECTION REPORT
            </Typography>
            
            <Typography variant="h5" color="text.secondary" textAlign="center">
              Generated on: {summary.timestamp || currentTime}
            </Typography>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {/* Main Stress Level Display */}
          <Box sx={{ 
            p: 4, 
            borderRadius: 3, 
            bgcolor: 'grey.50',
            border: `2px solid ${stressColor}`,
            mb: 3,
            textAlign: 'center'
          }}>
            <Typography variant="h4" color="text.secondary" gutterBottom>
              Current Stress Level
            </Typography>
            
            <Stack direction="row" alignItems="baseline" justifyContent="center" spacing={1} sx={{ mb: 2 }}>
              <Typography variant="h1" fontWeight={800} color={stressColor}>
                {levelPercent}
              </Typography>
              <Typography variant="h3" fontWeight={600} color="text.secondary">
                %
              </Typography>
            </Stack>

            <Chip
              label={summary.label}
              sx={{ 
                bgcolor: stressColor, 
                color: 'white', 
                fontSize: '2.0rem', 
                fontWeight: 700,
                px: 3,
                py: 1
              }}
              size="medium"
            />

            <Box sx={{ mt: 2, width: '100%' }}>
              <LinearProgress 
                variant="determinate" 
                value={levelPercent} 
                sx={{ 
                  height: 8, 
                  borderRadius: 4,
                  bgcolor: 'grey.200',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: stressColor,
                    borderRadius: 4
                  }
                }}
              />
            </Box>
          </Box>

          {/* Recommendations */}
          <Box sx={{ 
            p: 3, 
            borderRadius: 2, 
            border: '1px solid #e0e0e0',
            mb: 3
          }}>
            <Typography variant="h4" fontWeight={700} gutterBottom color="primary.main">
              Personalized Recommendations
            </Typography>
            <Stack spacing={2}>
              {recommendations.slice(0, 6).map((rec, idx) => (
                <Stack key={idx} direction="row" spacing={2} alignItems="flex-start">
                  <Box sx={{ 
                    width: 40, 
                    height: 40, 
                    bgcolor: stressColor, 
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    flexShrink: 0
                  }}>
                    {idx + 1}
                  </Box>
                  <Typography variant="body1" sx={{ lineHeight: 1.6, fontSize: '2.0rem' }}>
                    {rec}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>

          {/* Footer */}
          <Box sx={{ mt: 'auto', pt: 3, textAlign: 'center' }}>
            <Typography variant="h3" fontWeight={700} color="primary.main">
              "We Always Care For You"
            </Typography>
          </Box>
        </Box>

        {/* Controls: Print / Cancel with countdown */}
        <Stack 
          direction="row" 
          spacing={2} 
          alignItems="center" 
          justifyContent="center" 
          sx={{ p: 2, bgcolor: 'grey.50' }}
        >
          <Button 
            variant="contained" 
            color="primary" 
            onClick={onPrint}
            startIcon={<Print />}
            size="large"
          >
            Print Report
          </Button>
          <Button 
            variant="outlined" 
            color="inherit" 
            onClick={onCancel}
            startIcon={<Close />}
            size="large"
          >
            Close{countdown > 0 ? ` (${countdown})` : ''}
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
};

export default StressDashboard;