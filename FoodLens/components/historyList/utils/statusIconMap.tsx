import React from 'react';
import { AlertCircle, AlertTriangle, ShieldCheck } from 'lucide-react-native';

export const renderStatusIcon = (kind: 'ok' | 'avoid' | 'ask') => {
  if (kind === 'ok') return <ShieldCheck size={16} color="#22C55E" />;
  if (kind === 'avoid') return <AlertCircle size={16} color="#F43F5E" />;
  return <AlertTriangle size={16} color="#CA8A04" />;
};
