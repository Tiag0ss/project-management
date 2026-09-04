/* Migrated into AppShell — Navbar removed; chrome from app/(app)/layout */
import { redirect } from 'next/navigation';

export default function VacationApprovalsRedirectPage() {
  redirect('/approvals?tab=vacations');
}
