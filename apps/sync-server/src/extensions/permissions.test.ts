import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldDisconnectForPermissionChange } from './permissions';

test('disconnects an editor when access is downgraded to viewer', () => {
  assert.equal(shouldDisconnectForPermissionChange('editor', 'viewer'), true);
});

test('disconnects an editor when access is revoked entirely', () => {
  assert.equal(shouldDisconnectForPermissionChange('editor', null), true);
});

test('keeps a viewer connected when access is upgraded', () => {
  assert.equal(shouldDisconnectForPermissionChange('viewer', 'editor'), false);
});

test('keeps a commenter connected when the role is unchanged', () => {
  assert.equal(shouldDisconnectForPermissionChange('commenter', 'commenter'), false);
});
