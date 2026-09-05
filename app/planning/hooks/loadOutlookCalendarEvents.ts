import { getApiUrl } from '@/lib/api/config';

export interface PlannerOutlookEvent {
  id: string;
  subject: string;
  start: string;
  end: string;
  isAllDay: boolean;
  webLink: string | null;
  userId: number;
  userName?: string;
  userEmail?: string;
}

interface LoadOutlookCalendarParams {
  token: string | null;
  startDate: string;
  endDate: string;
}

interface LoadOutlookCalendarResult {
  events: PlannerOutlookEvent[];
  enabled: boolean;
}

/** Fetch Outlook calendar events for the planning timeline date range. */
export async function loadOutlookCalendarEvents({
  token,
  startDate,
  endDate,
}: LoadOutlookCalendarParams): Promise<LoadOutlookCalendarResult> {
  if (!token) {
    return { events: [], enabled: false };
  }

  const response = await fetch(
    `${getApiUrl()}/api/outlook-calendar/events?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    return { events: [], enabled: false };
  }

  const data = await response.json();
  if (!data?.success || !data?.enabled || !Array.isArray(data.events)) {
    return { events: [], enabled: false };
  }

  const events: PlannerOutlookEvent[] = data.events
    .map((eventItem: Record<string, unknown>) => ({
      id: String(eventItem.id || ''),
      subject: String(eventItem.subject || '(No subject)'),
      start: String(eventItem.start || ''),
      end: String(eventItem.end || ''),
      isAllDay: !!eventItem.isAllDay,
      webLink: (eventItem.webLink as string | null) || null,
      userId: Number(eventItem.userId || 0),
      userName: eventItem.userName as string | undefined,
      userEmail: eventItem.userEmail as string | undefined,
    }))
    .filter((eventItem: PlannerOutlookEvent) =>
      !!eventItem.id && !!eventItem.start && !!eventItem.end && eventItem.userId > 0
    );

  return { events, enabled: true };
}
