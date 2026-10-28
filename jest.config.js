/** Jest + SWC (no ts-jest, so no native compile step is needed on Windows). */
module.exports = {
  // Coverage (npm run test:coverage). The three entry-point scripts are excluded because they only
  // start the server, run migrations or seed demo data; they are checked by hand, not by the tests.
  collectCoverageFrom: ["src/**/*.ts", "!src/server.ts", "!src/migrate.ts", "!src/seed.ts"],
  coverageProvider: "v8",
  coverageReporters: ["text-summary", "text"],
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": [
      "@swc/jest",
      { jsc: { parser: { syntax: "typescript" }, target: "es2022" }, module: { type: "commonjs" } },
    ],
  },
  // source files import "./x.js"; map that to the .ts file
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
};
