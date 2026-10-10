// Authored mail, keyed by mail owner id (an employee id, or a casebook person id). Merged ahead
// of generated mail, so it is always present and never AI-written. Texts are neutral: no
// accusations, no secret name (the naming rule). Story threads arrive in a later spec.
import type { MailMessage } from '../types/mail';

export const AUTHORED_MAIL: Readonly<Record<string, MailMessage[]>> = {
  torres: [
    {
      id: 'auth_torres_1',
      threadId: 'auth_torres_1',
      from: 'Facilities Desk',
      to: 'Elena Torres',
      subject: 'Executive floor: badge reader maintenance',
      body:
        'Ms. Torres,\n\nThe badge readers on the executive floor will be serviced on Thursday evening ' +
        'between 18:00 and 20:00. Doors will stay on the standby profile. Please let the C-suite ' +
        'offices know.\n\nFacilities Desk',
      sentAt: '2024-10-07',
      source: 'authored',
    },
  ],
  mercer: [
    {
      id: 'auth_mercer_1',
      threadId: 'auth_mercer_1',
      from: 'IT Operations',
      to: 'James Mercer',
      subject: 'Quarterly access review: sign-off needed',
      body:
        'James,\n\nThe quarterly access review for the security division is ready for your ' +
        'sign-off. Nothing is flagged this cycle. Please confirm by the end of the month.\n\n' +
        'IT Operations',
      sentAt: '2024-10-04',
      source: 'authored',
    },
  ],
};
