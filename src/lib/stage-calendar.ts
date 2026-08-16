/**
 * "Add to calendar" for scheduled stages — a client-built .ics download, so it
 * works for signed-out visitors too (the in-app reminder needs an account; a
 * calendar file needs nothing). One VEVENT with a 10-minute display alarm.
 */

import type { AudioSpace } from '@/types/audio-spaces.types';
import { dehubLinkFor } from '@/lib/dehub-links';

/** 20260819T200000Z — the UTC basic format ICS expects. */
function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function downloadStageIcs(stage: AudioSpace): void {
  if (!stage.scheduled_at) return;
  const start = new Date(stage.scheduled_at);
  // Stages carry no stated length; block an hour.
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const link = dehubLinkFor.stage(stage);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DeHub//Stages//EN',
    'BEGIN:VEVENT',
    `UID:stage-${stage.id}@dehub.io`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(stage.title)}`,
    `DESCRIPTION:${icsEscape([stage.description || '', link].filter(Boolean).join('\n'))}`,
    `URL:${link}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(stage.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dehub-stage-${stage.short_id ?? stage.id}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
