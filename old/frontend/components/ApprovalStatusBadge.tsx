'use client';

interface ApprovalStatusBadgeProps {
  status?: string;
  variant?: 'rounded' | 'pill';
}

const normalizeStatus = (status?: string): 'approved' | 'rejected' | 'pending' => {
  switch (status?.toLowerCase()) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    default:
      return 'pending';
  }
};

const STYLES = {
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
} as const;

const LABELS = {
  approved: '✓ Approved',
  rejected: '✗ Rejected',
  pending: '⏳ Pending',
} as const;

export default function ApprovalStatusBadge({ status, variant = 'rounded' }: ApprovalStatusBadgeProps) {
  const normalized = normalizeStatus(status);
  const shapeClass = variant === 'pill' ? 'rounded-full font-semibold' : 'rounded font-medium';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs ${shapeClass} ${STYLES[normalized]}`}>
      {LABELS[normalized]}
    </span>
  );
}
