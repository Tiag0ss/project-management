/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
import { redirect } from 'next/navigation';

export default function VacationApprovalsRedirectPage() {
  redirect('/approvals?tab=vacations');
}
