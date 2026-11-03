import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  history.replaceState(null, '', '/');
  window.scrollTo = vi.fn();
  localStorage.clear();
  document.documentElement.lang = 'es';
  document.documentElement.dataset.theme = 'light';
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) });
});
afterEach(cleanup);
// jsdom has no native dialog interaction. Real focus trapping/Escape are checked in-browser.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };


