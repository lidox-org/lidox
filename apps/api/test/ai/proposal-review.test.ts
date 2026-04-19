import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectProposalStaleness,
  resolveProposalReview,
} from '../../src/ai/proposal-review';

test('proposal review detects staleness from changed selection hash', () => {
  const stale = detectProposalStaleness({
    sourceTextHash:
      '5b4b67b5d68e02c992760de07640472efe53a7f7553865f83262d0a74efc3e5d',
    sourceStateVector: null,
    currentSelection: 'Changed text',
  });

  assert.equal(stale, true);
});

test('proposal review detects staleness from changed state vector', () => {
  const stale = detectProposalStaleness({
    sourceTextHash: null,
    sourceStateVector: 'old-state',
    currentStateVector: 'new-state',
  });

  assert.equal(stale, true);
});

test('proposal review maps actions to final history states', () => {
  assert.deepEqual(
    resolveProposalReview({
      review: { action: 'accept' },
      proposalText: 'Proposal text',
    }),
    {
      nextStatus: 'accepted',
      appliedText: 'Proposal text',
    },
  );

  assert.deepEqual(
    resolveProposalReview({
      review: { action: 'partial', appliedText: 'Edited proposal' },
      proposalText: 'Proposal text',
    }),
    {
      nextStatus: 'partial',
      appliedText: 'Edited proposal',
    },
  );

  assert.deepEqual(
    resolveProposalReview({
      review: { action: 'reject' },
      proposalText: 'Proposal text',
    }),
    {
      nextStatus: 'rejected',
      appliedText: null,
    },
  );
});
