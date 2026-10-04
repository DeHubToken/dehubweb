import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ApplicationComments } from '@/features/work/components/ApplicationComments';
import type { WorkApplication, WorkApplicationComment } from '@/features/work/types';

const mutation = vi.hoisted(() => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/features/work/hooks/use-application-comments', () => ({ useCommentOnApplication: () => mutation }));
vi.mock('@/features/work/components/WorkUser', () => ({ WorkUser: ({ address }: { address: string }) => <span>{address}</span> }));

const application = { id: 'application-1', job_id: 'bounty-1', applicant_address: '0xapplicant' } as WorkApplication;
const comments = [{ id: 'comment-1', application_id: application.id, job_id: application.job_id,
  author_address: '0xposter', body: 'Can you test on an iPad?', created_at: '2026-10-04T10:00:00Z' }] as WorkApplicationComment[];

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mutation.isPending = false; mutation.isError = false; });

describe('bounty application comments', () => {
  it('shows existing replies on the application to visitors without a composer', () => {
    render(<ApplicationComments application={application} comments={comments} canReply={false} />);
    expect(screen.getByText('Can you test on an iPad?')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'messages.reply' })).toBeNull();
  });

  it('opens an inline composer and posts to the same bounty application', () => {
    render(<ApplicationComments application={application} comments={comments} canReply />);
    fireEvent.click(screen.getByRole('button', { name: 'messages.reply' }));
    const input = screen.getByRole('textbox', { name: 'messages.reply' });
    expect(input).toHaveFocus();
    expect(screen.getByRole('button', { name: 'comments.post' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Yes, on iPadOS 18.' } });
    fireEvent.click(screen.getByRole('button', { name: 'comments.post' }));
    expect(mutation.mutate).toHaveBeenCalledWith({ job_id: 'bounty-1', application_id: 'application-1', body: 'Yes, on iPadOS 18.' }, expect.any(Object));
  });

  it('keeps the unsaved reply editable after a failed save', () => {
    const { rerender } = render(<ApplicationComments application={application} comments={[]} canReply />);
    fireEvent.click(screen.getByRole('button', { name: 'messages.reply' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Please clarify the requirements.' } });
    mutation.isError = true;
    rerender(<ApplicationComments application={application} comments={[]} canReply />);
    expect(screen.getByRole('alert')).toHaveTextContent('common.somethingWentWrong');
    expect(screen.getByRole('textbox')).toHaveValue('Please clarify the requirements.');
    expect(screen.getByRole('textbox')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'comments.post' })).toBeEnabled();
  });

  it('prevents duplicate submits while saving', () => {
    mutation.isPending = true;
    render(<ApplicationComments application={application} comments={[]} canReply />);
    fireEvent.click(screen.getByRole('button', { name: 'messages.reply' }));
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'comments.post' })).toBeDisabled();
    expect(mutation.mutate).not.toHaveBeenCalled();
  });
});
