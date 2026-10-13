/** Jest + SWC (no ts-jest, so no native compile step is needed on Windows). */
module.exports = {
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
