import { redirect } from 'next/navigation';

export default function VacationApprovalsRedirectPage() {
  redirect('/approvals?tab=vacations');
}
