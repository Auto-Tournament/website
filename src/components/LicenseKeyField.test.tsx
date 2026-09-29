// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LicenseKeyField } from './LicenseKeyField';

const token = 'ATL1.abcdefghijklmnopqrstuvwxyz0123456789.sig1234';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('LicenseKeyField', () => {
  it('masks the key by default and reveals it with Show key', () => {
    render(<LicenseKeyField token={token} data-testid="key" />);
    const field = screen.getByTestId('key');
    expect(field.textContent).not.toContain(token);
    expect(field.textContent).toContain('ATL1.abc');
    expect(field.textContent).toContain('1234');
    expect(screen.getByLabelText('License key, hidden')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Show key' }));
    expect(field.textContent).toContain(token);
    expect(screen.getByRole('button', { name: 'Hide key' })).toBeTruthy();
    expect(screen.queryByLabelText('License key, hidden')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Hide key' }));
    expect(field.textContent).not.toContain(token);
  });

  it('Copy copies the full token even while masked, and shows Copied briefly', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<LicenseKeyField token={token} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy license key' }));
    expect(await screen.findByRole('button', { name: 'License key copied' })).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(token);
    await screen.findByRole('button', { name: 'Copy license key' }, { timeout: 3000 });
  });

  it('reveals the key and shows an error when copying fails', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('blocked');
    });
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    (document as unknown as { execCommand: () => boolean }).execCommand = vi.fn(() => false);
    render(<LicenseKeyField token={token} data-testid="key" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy license key' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain("Couldn't copy. Select the key and copy it.");
    expect(screen.getByTestId('key').textContent).toContain(token);
  });
});
