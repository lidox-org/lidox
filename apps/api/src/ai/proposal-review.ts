import type {
  AiInteractionStatus,
  AiProposalReviewAction,
  AiProposalReviewInput,
} from '@lidox/types';
import * as crypto from 'crypto';

interface StalenessInput {
  sourceTextHash: string | null;
  sourceStateVector: string | null;
  currentSelection?: string;
  currentStateVector?: string;
}

export function detectProposalStaleness(input: StalenessInput): boolean {
  const selectionChanged =
    input.currentSelection !== undefined &&
    input.sourceTextHash !== null &&
    sha256(input.currentSelection) !== input.sourceTextHash;

  const stateVectorChanged =
    input.currentStateVector !== undefined &&
    input.sourceStateVector !== null &&
    input.currentStateVector !== input.sourceStateVector;

  return selectionChanged || stateVectorChanged;
}

export function resolveProposalReview(input: {
  review: AiProposalReviewInput;
  proposalText: string | null;
}): {
  nextStatus: AiInteractionStatus;
  appliedText: string | null;
} {
  const proposalText = input.proposalText ?? null;

  switch (input.review.action) {
    case 'reject':
      return {
        nextStatus: 'rejected',
        appliedText: null,
      };
    case 'partial':
      return {
        nextStatus: 'partial',
        appliedText: input.review.appliedText ?? proposalText,
      };
    case 'accept':
    default:
      return {
        nextStatus: 'accepted',
        appliedText: input.review.appliedText ?? proposalText,
      };
  }
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}
