import React from 'react';
import { Avatar, Box, List, ListItem, ListItemAvatar, ListItemText, Typography } from '@mui/material';

export type HistoryItem = {
  timestamp: string; // ISO
  level: number; // 0..1
  label: 'Low' | 'Moderate' | 'High';
  snapshot?: string; // data URL
}

const HistoryPanel: React.FC<{ items: HistoryItem[] }> = ({ items }) => {
  if (items.length === 0) {
    return (
      <Box sx={{ color: 'text.secondary', textAlign: 'center', py: 3 }}>
        <Typography variant="body2">No history yet. Capture & analyze to add entries.</Typography>
      </Box>
    );
  }

  return (
    <List dense>
      {items.map((it, idx) => (
        <ListItem key={idx} sx={{ borderBottom: '1px dashed #eee' }}>
          <ListItemAvatar>
            <Avatar variant="rounded" src={it.snapshot} sx={{ width: 44, height: 44 }}>
              {Math.round(it.level * 100)}%
            </Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={`${new Date(it.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — ${it.label}`}
            secondary={`Level: ${Math.round(it.level * 100)}%`}
          />
        </ListItem>
      ))}
    </List>
  );
};

export default HistoryPanel;