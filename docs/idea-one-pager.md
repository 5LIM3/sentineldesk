# SentinelDesk API

Track: Backend Development   Stack: Node.js, Express, TypeScript, SQLite, Zod, JWT, Jest + Supertest
GitHub repo: https://github.com/5LIM3/sentineldesk
Target user: SOC analysts and their lead working shifts in a small security team
Problem: Incidents get lost between shifts, with no single record of who owns what, what was investigated and what changed.
Entities: Users, Incidents, Incident Updates
Core flow: create incident -> assign analyst -> add investigation notes/status changes (previous -> new status recorded) -> resolve
In scope: incident CRUD, investigation history, roles (analyst/admin), validation, tests, deploy
Out of scope: dashboard/UI, alert ingestion from SIEMs, email notifications, file attachments
Top 3 risks: scope creep (dashboard), auth/permissions bugs in Week 2, SQLite data loss on a host without persistent storage (a seed script does not protect real data; verify a persistent disk before choosing a host)
Google Drive link: 