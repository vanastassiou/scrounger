# Action Items

Consolidated future improvements from security, performance, data integrity, PWA, UX, code quality, and API audits (2026-01-23).

---

## Security

- [ ] Add Content-Security-Policy headers
- [ ] Implement Subresource Integrity (SRI) for external resources
- [ ] Add security headers (X-Frame-Options, X-Content-Type-Options)
- [ ] Establish regular security audit schedule
- [ ] Consider IndexedDB encryption library for sensitive data

---

## Performance

- [ ] Add performance monitoring (Web Vitals integration)
- [ ] Implement virtual scrolling for very large lists (>500 items)
- [ ] Consider code splitting if bundle grows significantly
- [ ] Add service worker background sync for scheduled updates
- [ ] Preconnect to API domains (`<link rel="preconnect">`)

---

## Data Integrity

- [ ] Add checksums for data integrity verification
- [ ] Implement point-in-time recovery
- [ ] Add data encryption at rest
- [ ] Create automated backup schedule

---

## Offline/PWA

- [ ] Add periodic background sync for automatic refresh
- [ ] Implement push notifications for sales and events
- [ ] Add cache storage quota monitoring
- [ ] Consider Workbox for advanced caching strategies

---

## UX Enhancements

- [ ] Haptic feedback on successful item log (vibration API)
- [ ] Show pending items queue when offline
- [ ] Quick-add templates for common item types
- [ ] Voice command parsing ("Log a Pendleton shirt, $12")
- [ ] Camera integration during item logging

---

## Code Quality

- [ ] Consider TypeScript migration for type safety
- [ ] Add JSDoc documentation to all public functions
- [ ] Extract more reusable UI components
- [ ] Add unit test coverage metrics

---

## Chat/API

- [ ] Add request deduplication to prevent duplicate API calls
- [ ] Implement response caching for common queries
- [ ] Add analytics for error rates and usage patterns
- [ ] Consider WebSocket for persistent connection

---

## Priority Guide

**High impact, lower effort:**
- Web Vitals monitoring
- Preconnect headers
- Push notifications

**High impact, higher effort:**
- Virtual scrolling
- TypeScript migration
- Background sync

**Nice to have:**
- Haptic feedback
- Camera integration
- Voice commands
