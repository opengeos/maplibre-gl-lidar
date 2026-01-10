import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test (for React component tests)
afterEach(() => {
  cleanup();
});
