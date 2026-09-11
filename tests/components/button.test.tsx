import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/shared/components/ui/button';

describe('Button', () => {
  it('supports keyboard activation with an accessible name', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>保存</Button>);
    await user.tab();
    expect(screen.getByRole('button', { name: '保存' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('prevents disabled actions', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        保存
      </Button>
    );
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('preserves link semantics when composed with a child', () => {
    render(
      <Button asChild>
        <a href="https://example.invalid/help">帮助</a>
      </Button>
    );
    expect(screen.getByRole('link', { name: '帮助' })).toHaveAttribute(
      'href',
      'https://example.invalid/help'
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
