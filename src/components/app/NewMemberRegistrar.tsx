/**
 * New Member Registrar
 * ====================
 * Renders nothing. Puts the signed-in account on the new-members roster once
 * per session, and shows the one-time "you are visible as new" notice.
 *
 * A component rather than a call inside AppLayout so its auth subscription
 * cannot re-render the whole app shell, and a component rather than a hook
 * inside AuthProvider so a failure here can never touch a login.
 *
 * @module components/app/NewMemberRegistrar
 */

import { useRegisterNewMember } from '@/hooks/use-new-members';

export function NewMemberRegistrar() {
  useRegisterNewMember();
  return null;
}
