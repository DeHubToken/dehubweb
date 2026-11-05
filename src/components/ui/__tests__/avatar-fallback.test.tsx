import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';

describe('AvatarFallback', () => {
  it('shows the initials when there is no photo', () => {
    render(<Avatar><AvatarFallback>J</AvatarFallback></Avatar>);
    expect(screen.getByText('J')).toBeTruthy();
  });

  it('keeps a plain tile while the photo is still loading', () => {
    render(
      <Avatar>
        <AvatarImage src="https://example.com/a.jpg" />
        <AvatarFallback>J</AvatarFallback>
      </Avatar>,
    );
    expect(screen.queryByText('J')).toBeNull();
    expect(document.querySelector('[data-avatar-fallback]')).toBeTruthy();
  });

  it('shows the initials when the photo is missing', async () => {
    render(
      <Avatar>
        <AvatarImage src={undefined} />
        <AvatarFallback>J</AvatarFallback>
      </Avatar>,
    );
    expect(await screen.findByText('J')).toBeTruthy();
  });
});
