// src/store/state.js
import { signal, effect } from '../libs/signals.js';

// Establish robust state hooks
export const pendingReviews = signal([]);
export const matchingStrategy = signal('hybrid');

// Initialize local preference caches from local device storage
browser.storage.local.get({ matchingStrategy: 'hybrid' }).then(res => {
  matchingStrategy.value = res.matchingStrategy;
});

// Reactively watch state changes to modify the browser icon badge text
effect(() => {
  const count = pendingReviews.value.length;
  const badgeText = count > 0 ? count.toString() : "";
  browser.action.setBadgeText({ text: badgeText });
  browser.action.setBadgeBackgroundColor({ color: "#FF5500" });
});