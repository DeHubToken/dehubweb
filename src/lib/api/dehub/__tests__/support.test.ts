import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status }),
  );
}
function fetchUrl(): string { return vi.mocked(fetch).mock.calls[0][0] as string; }
function fetchOpts() { return vi.mocked(fetch).mock.calls[0][1]; }

beforeEach(() => {
  localStorage.setItem('dehub_token', 'test-jwt');
  localStorage.setItem('dehub_token_timestamp', String(Date.now()));
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('getMySupportTickets', () => {
  it('unwraps the result envelope and keeps the server counts', async () => {
    mockFetch({
      result: {
        tickets: [
          { ref: 'DH-A', status: 'open' },
          { ref: 'DH-B', status: 'closed' },
        ],
        openCount: 1,
        closedCount: 1,
      },
    });
    const { getMySupportTickets } = await import('@/lib/api/dehub/support');
    const result = await getMySupportTickets();

    expect(fetchUrl()).toContain('/api/support/tickets');
    expect(result.tickets).toHaveLength(2);
    expect(result.openCount).toBe(1);
    expect(result.closedCount).toBe(1);
  });

  it('derives the counts when an older API omits them', async () => {
    mockFetch({
      result: {
        tickets: [
          { ref: 'DH-A', status: 'open' },
          { ref: 'DH-B', status: 'in_progress' },
          { ref: 'DH-C', status: 'resolved' },
        ],
      },
    });
    const { getMySupportTickets } = await import('@/lib/api/dehub/support');
    const result = await getMySupportTickets();

    expect(result.openCount).toBe(2);
    expect(result.closedCount).toBe(1);
  });

  it('survives a response with no tickets array at all', async () => {
    mockFetch({ result: {} });
    const { getMySupportTickets } = await import('@/lib/api/dehub/support');
    const result = await getMySupportTickets();
    expect(result.tickets).toEqual([]);
    expect(result.openCount).toBe(0);
  });
});

describe('createSupportTicket', () => {
  it('POSTs the ticket and returns the reference', async () => {
    mockFetch({ result: { ref: 'DH-K3M7QP', status: 'open', emailed: true } });
    const { createSupportTicket } = await import('@/lib/api/dehub/support');

    const result = await createSupportTicket({
      category: 'bug',
      severity: 'normal',
      subject: 'Uploads stick on pending',
      description: 'Every upload sits on pending and never publishes.',
    });

    expect(fetchOpts()?.method).toBe('POST');
    expect(JSON.parse(String(fetchOpts()?.body)).subject).toBe('Uploads stick on pending');
    expect(result.ref).toBe('DH-K3M7QP');
    expect(result.emailed).toBe(true);
  });

  it("surfaces the server's own refusal text rather than a generic failure", async () => {
    mockFetch({ message: 'The description is too thin to act on.' }, 400);
    const { createSupportTicket } = await import('@/lib/api/dehub/support');

    await expect(
      createSupportTicket({ category: 'bug', severity: 'low', subject: 'x', description: 'y' }),
    ).rejects.toThrow('The description is too thin to act on.');
  });
});

describe('isTicketOpen', () => {
  it('treats only open and in_progress as still waiting on a human', async () => {
    const { isTicketOpen } = await import('@/lib/api/dehub/support');
    expect(isTicketOpen('open')).toBe(true);
    expect(isTicketOpen('in_progress')).toBe(true);
    expect(isTicketOpen('resolved')).toBe(false);
    expect(isTicketOpen('closed')).toBe(false);
  });
});
