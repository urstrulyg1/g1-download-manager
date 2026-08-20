import React from 'react';

export interface SpeedTickerProps {
  bytesPerSec: number;
  className?: string;
}

export const SpeedTicker: React.FC<SpeedTickerProps> = ({ bytesPerSec, className = '' }) => {
  const formatSpeed = (bytes: number) => {
    if (bytes <= 0) return { value: '0.0', unit: 'KB/s' };
    if (bytes >= 1024 * 1024 * 1024) {
      return { value: (bytes / (1024 * 1024 * 1024)).toFixed(2), unit: 'GB/s' };
    }
    if (bytes >= 1024 * 1024) {
      return { value: (bytes / (1024 * 1024)).toFixed(2), unit: 'MB/s' };
    }
    return { value: (bytes / 1024).toFixed(1), unit: 'KB/s' };
  };

  const { value, unit } = formatSpeed(bytesPerSec);

  return (
    <span className={`font-mono tabular-nums inline-flex items-baseline gap-1 ${className}`}>
      <span className="font-bold">{value}</span>
      <span className="text-[10px] text-slate-400 font-sans uppercase font-medium">{unit}</span>
    </span>
  );
};
