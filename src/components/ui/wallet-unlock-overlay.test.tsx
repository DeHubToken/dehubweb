import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle, DialogClose } from './dialog';
import { Drawer, DrawerContent, DrawerTitle } from './drawer';
import { finishWalletUnlock, setWalletUnlockPrompt } from '@/lib/wallet-unlock-flow';

afterEach(() => { cleanup(); finishWalletUnlock(false); });

function Payment() {
  const [open, setOpen] = useState(true);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent aria-describedby={undefined}>
      <DialogTitle>Payment</DialogTitle>
      <input aria-label="Amount" defaultValue="25" />
      <DialogClose>Cancel payment</DialogClose>
    </DialogContent>
  </Dialog>;
}

describe('wallet unlock over a payment form', () => {
  it('keeps the existing form mounted while unlocking and allows dismissal afterwards', () => {
    const { rerender } = render(<Payment />);
    const amount = screen.getByRole('textbox', { name: 'Amount' });
    fireEvent.change(amount, { target: { value: '123' } });
    act(() => setWalletUnlockPrompt(true));
    fireEvent.click(screen.getByText('Cancel payment'));
    expect(amount).toBeInTheDocument();
    expect(amount).toHaveValue('123');
    rerender(<><Payment /><Drawer open walletPrompt onOpenChange={() => finishWalletUnlock(false)}>
      <DrawerContent aria-describedby={undefined}><DrawerTitle>Unlock wallet</DrawerTitle><input aria-label="Wallet password" /></DrawerContent>
    </Drawer></>);
    const password = screen.getByRole('textbox', { name: 'Wallet password' });
    act(() => password.focus());
    expect(password).toHaveFocus();
    // A modal/non-modal Root toggle here would remount the payment's inputs.
    expect(amount).toBeInTheDocument();
    expect(amount).toHaveValue('123');
    rerender(<Payment />);
    act(() => finishWalletUnlock(false));
    fireEvent.click(screen.getByText('Cancel payment'));
    expect(amount).not.toBeInTheDocument();
  });
});
