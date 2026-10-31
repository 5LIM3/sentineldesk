# SentinelDesk — Project Declaration

I declare that SentinelDesk was developed as my individual project for the BuildLab Stage 1 Backend Development programme. I was responsible for defining the project scope, designing the data model, implementing the API, developing authentication and authorisation, writing automated tests, documenting the system, and making technical decisions throughout development.

## Technologies and Dependencies Used

SentinelDesk was developed using Node.js and TypeScript, with Express 5 for the REST API and better-sqlite3 for SQLite database access. Zod was used for input validation, bcryptjs for password hashing, and jsonwebtoken for JWT-based authentication. Security-related middleware includes Helmet for HTTP security headers, CORS for cross-origin request configuration, and express-rate-limit for rate limiting. The dotenv package is included for environment-variable configuration.

Development and testing tools include TypeScript, tsx, Jest, Supertest, @swc/core, and @swc/jest, alongside the relevant TypeScript type-definition packages. The project includes scripts for development, compilation, type-checking, testing, database migrations, and database seeding.

## Use of AI Assistance and External Resources

I used ChatGPT as a support tool during development to help clarify technical concepts, troubleshoot issues, review implementation and test logic, and improve project documentation and technical notes. I reviewed and applied suggestions as appropriate and used local commands and automated tests to check the project’s behaviour.

The project uses established open-source libraries and development tools listed in its package.json. Any AI assistance was used as part of my development process and does not replace my responsibility for understanding, reviewing, and explaining the submitted work.

## Testing, Deployment, and Limitations

I tested the API locally using automated Jest and Supertest tests. At the latest recorded test run, all 108 tests across five test suites passed. The recorded coverage was 98.73% statements, 94.59% branches, and 100% functions.

The production dependency audit reported zero vulnerabilities when run with `npm audit --omit=dev`; the full dependency tree reported five low-severity vulnerabilities at the time of the recorded check.

At the time of this declaration, the project had not been publicly deployed, and the Docker image had not been fully built and verified. These limitations, along with other known risks and potential improvements, are documented in the repository.

I understand the architecture, intended use, implementation decisions, testing approach, and known limitations of SentinelDesk, and I take responsibility for the work I submit.