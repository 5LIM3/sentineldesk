# SentinelDesk — Technical Reflection
**BuildLab Stage 1: Backend Development**

## 1. What changed over the three weeks

Over the three weeks, SentinelDesk developed from an idea for a security incident management API into a more complete backend application with incident tracking, authentication, access controls, automated tests, security measures, and technical documentation.

**Week 1 — Core API and data integrity**

I started by identifying a problem related to my experience working as a SOC Analyst during my NYSC at Boch Systems. Security incidents need to be tracked properly so that responsibility, investigation notes, and progress are not lost when analysts hand over between shifts.

I designed SentinelDesk around three main entities: Users, Incidents, and Incident Updates. I implemented the core incident management functionality and focused on maintaining data integrity, handling invalid requests, and recording investigation history. I also created tests for important database constraints and incident workflows.

**Week 2 — Authentication, authorisation, and validation**

In the second week, I extended the API with JWT-based authentication and role- and ownership-based access controls. I implemented password hashing, protected endpoints, input validation, and consistent error handling.

I also worked on relationships between entities and edge cases, including duplicate email addresses, invalid status transitions, and requests made by users without the necessary permissions. This helped me understand that an API must do more than return successful responses: it must also handle failure cases correctly and protect data from unauthorised changes.

**Week 3 — Testing, security, performance, and documentation**

In the third week, I strengthened the application with authentication rate limiting, deliberate CORS configuration, security headers, and a database index to support incident listing. I expanded the automated security tests and added or updated the OpenAPI specification, setup guide, security and performance notes, and testing and coverage documentation.

I also reviewed dependency vulnerabilities, updated affected dependencies, corrected the coverage figures in the documentation, and pushed the changes to GitHub.

After these changes, the test suite passed all 108 tests across five suites. The coverage report showed 98.73% statement coverage, 94.59% branch coverage, and 100% function coverage. The production dependency audit also reported zero vulnerabilities, although the full dependency tree still reported five low-severity vulnerabilities.

## 2. What I learned

One important lesson was that backend development involves more than creating endpoints. Data integrity, authentication, authorisation, validation, error handling, testing, and documentation all affect whether an application can be used reliably.

I also learned the importance of preserving a traceable history of changes. In SentinelDesk, incident status changes are handled through the investigation-update workflow rather than a direct status edit. This helps maintain a record of the investigation as it progresses.

Another lesson was the value of automated testing. Testing successful requests alone would not have been sufficient. I needed to consider invalid input, authentication failures, permission checks, database constraints, and security-related behaviour.

Finally, I learned that high test coverage does not automatically prove that an application is production-ready. Documentation, deployment, dependency management, and real-world operational testing are also important.

## 3. What remains risky

SentinelDesk is still a backend API and has not been publicly deployed. Although the project includes Docker configuration and local setup instructions, the Docker image still needs to be built and tested in a clean environment.

SQLite also introduces a deployment consideration: the database file must be stored on persistent storage with an appropriate backup strategy. Otherwise, application records could be lost if the hosting environment replaces its filesystem.

The full dependency audit continues to report five low-severity vulnerabilities. These need to be reviewed and monitored rather than ignored simply because the production-only audit reports zero vulnerabilities.

Other areas for improvement include token revocation, further access-control hardening, and testing the application under realistic deployment conditions. SentinelDesk does not currently provide a frontend dashboard or ingest alerts directly from SIEM platforms. It manages incidents after suspicious activity has been identified.

## 4. What I would do next

My next steps would be to verify the setup instructions from a clean checkout, build and run the Docker image, and test the API in a deployment environment with persistent database storage and backups.

I would also review the remaining dependency advisories, strengthen authentication and session-management controls, and expand testing around deployment configuration and operational failure scenarios.

After stabilising the core API, I would consider building a frontend dashboard and exploring controlled integration with SIEM platforms so analysts could move from an alert to a managed incident more efficiently.

## 5. Conclusion

Over these three weeks, I moved SentinelDesk from a project idea to a tested and documented backend API with authentication, authorisation, incident history, security controls, and automated tests. The process helped me understand the importance of building reliable backend systems, validating assumptions through tests, and documenting limitations honestly.

The project is not yet production-ready, but it has given me a stronger foundation in API design, backend security, testing, and technical decision-making. My next priority is to verify the setup and deployment process, address the remaining risks, and continue improving the application without losing sight of the problem it was designed to solve.
