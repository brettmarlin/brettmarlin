import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { stagingDirFor, uploadableFiles } from './ship-beats.mjs';

test('stagingDirFor mirrors adopt-pastes\' default staging dir', () => {
  assert.equal(
    stagingDirFor('maf-machine-ai-endurance-coach', '/vault'),
    join('/vault', '_attachments', 'maf-machine-ai-endurance-coach'),
  );
});

test('uploadableFiles keeps images, drops dotfiles and strays, and sorts', () => {
  assert.deepEqual(
    uploadableFiles(['02-maf-b.png', '.DS_Store', '01-maf-a.jpg', 'notes.txt', '03-maf-c.webp', '.hidden.png']),
    ['01-maf-a.jpg', '02-maf-b.png', '03-maf-c.webp'],
  );
});

test('uploadableFiles of an empty dir listing is empty, the "nothing staged" case', () => {
  assert.deepEqual(uploadableFiles([]), []);
});
