import React, { useMemo } from 'react';
import { Box, Chip, Stack, Typography, List, ListItem, ListItemIcon, ListItemText, LinearProgress, Tooltip } from '@mui/material';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';

export type StressSummary = {
  level: number; // 0..1
  label: 'Low' | 'Moderate' | 'High';
  recommendations: string[];
}

const levelColor = (label: StressSummary['label']) => {
  switch (label) {
    case 'High': return 'error';
    case 'Moderate': return 'warning';
    default: return 'success';
  }
};

const StressPanel: React.FC<{ summary: StressSummary }> = ({ summary }) => {
  const percent = useMemo(() => Math.round(summary.level * 100), [summary.level]);

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip label={summary.label} color={levelColor(summary.label) as any} />
        <Typography variant="subtitle2" color="text.secondary">Stress Level</Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="subtitle1" fontWeight={700}>{percent}%</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={percent} sx={{ height: 10, borderRadius: 999 }} color={levelColor(summary.label) as any} />

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Recommendations</Typography>
        <List dense>
          {summary.recommendations.map((rec, idx) => (
            <ListItem key={idx} sx={{ py: 0 }}>
              <ListItemIcon sx={{ minWidth: 28 }}>
                <TipsAndUpdatesIcon color="primary" fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={rec} />
            </ListItem>
          ))}
        </List>
      </Box>
    </Stack>
  );
};

export default StressPanel;