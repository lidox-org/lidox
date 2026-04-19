import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AiProposal } from './AiProposal';

describe('AiProposal', () => {
  it('lets the user edit a suggestion before applying it', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();

    render(
      <AiProposal
        taskId="task-1"
        taskType="rewrite"
        original="Original sentence."
        proposed="Improved sentence."
        onAccept={onAccept}
        onReject={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: /edit before apply/i }),
    );

    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'Manual final sentence.');
    await user.click(
      screen.getByRole('button', { name: /apply edited copy/i }),
    );

    expect(onAccept).toHaveBeenCalledWith({
      text: 'Manual final sentence.',
      action: 'partial',
      html: undefined,
    });
  });

  it('blocks acceptance and shows a stale warning when the source changed', () => {
    render(
      <AiProposal
        taskId="task-2"
        taskType="rewrite"
        original="Original sentence."
        proposed="Improved sentence."
        stale
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/source text changed while this proposal was in flight/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /regenerate needed/i }),
    ).toBeDisabled();
  });

  it('shows incremental streaming text while generation is in progress', () => {
    render(
      <AiProposal
        taskId="task-3"
        taskType="rewrite"
        original="Original sentence."
        proposed="Partial streamed suggestion..."
        streaming
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText(/ai is generating a suggestion/i)).toBeInTheDocument();
    expect(screen.getByText('Partial streamed suggestion...')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /generating/i }),
    ).toBeDisabled();
  });
});
