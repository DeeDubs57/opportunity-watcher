# opportunity-watcher

Checks Johnson & Johnson's public careers feed every 30 minutes for new roles in communications, marketing, medical affairs, and patient-facing work that are based in France or fully remote within the EU.

- New match: the run fails on purpose, and GitHub emails you. The error message lists the role and link.
- `JNJ_MATCHES.md`: every matching role open right now.
- `seen-jnj.json`: roles already checked, so you only hear about each one once.
- The first run records existing roles silently.

Edit the lists at the top of `watcher.mjs` to widen or narrow the search.
