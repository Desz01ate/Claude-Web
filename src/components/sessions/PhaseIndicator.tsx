'use client';

import { cn } from '@/lib/utils';
import type { SessionPhase } from '@/types';

interface PhaseIndicatorProps {
  phase: SessionPhase;
  size?: 'sm' | 'md' | 'lg';
}

export function PhaseIndicator({ phase, size = 'md' }: PhaseIndicatorProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  const getPhaseColor = () => {
    switch (phase.type) {
      case 'processing':
        return 'bg-blue-500';
      case 'waitingForInput':
        return 'bg-green-500';
      case 'waitingForApproval':
        return 'bg-yellow-500';
      case 'compacting':
        return 'bg-purple-500';
      case 'ended':
        return 'bg-gray-400';
      case 'idle':
      default:
        return 'bg-gray-300';
    }
  };

  const getPhaseLabel = () => {
    switch (phase.type) {
      case 'processing':
        return 'Processing';
      case 'waitingForInput':
        return 'Waiting for input';
      case 'waitingForApproval':
        return `Awaiting approval: ${phase.permission.toolName}`;
      case 'compacting':
        return 'Compacting context';
      case 'ended':
        return 'Session ended';
      case 'idle':
      default:
        return 'Idle';
    }
  };

  const isAnimated =
    phase.type === 'processing' || phase.type === 'compacting';

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'rounded-full',
          sizeClasses[size],
          getPhaseColor(),
          isAnimated && 'animate-pulse'
        )}
      />
      <span className="text-sm text-muted-foreground">{getPhaseLabel()}</span>
    </div>
  );
}
