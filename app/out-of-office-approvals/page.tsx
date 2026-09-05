/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
import { redirect } from 'next/navigation';

export default function OutOfOfficeApprovalsRedirectPage() {
  redirect('/approvals?tab=out-of-office');
}
