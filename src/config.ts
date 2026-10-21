export interface AppConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptRounds: number;
}

/**
 * Reads settings from environment variables. There is deliberately NO default JWT secret:
 * a secret baked into the code would be public the moment the repo is. The server refuses
 * to start until JWT_SECRET is set (see .env.example for how to generate one).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const jwtSecret = env.JWT_SECRET ?? "";
  if (jwtSecret.length < 32) {
    throw new Error(
      "JWT_SECRET is missing or too short (needs at least 32 characters). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
        "and put it in your .env file."
    );
  }
  const bcryptRounds = Number(env.BCRYPT_ROUNDS ?? 10);
  if (!Number.isInteger(bcryptRounds) || bcryptRounds < 4 || bcryptRounds > 15) {
    throw new Error("BCRYPT_ROUNDS must be a whole number between 4 and 15");
  }
  return { jwtSecret, jwtExpiresIn: env.JWT_EXPIRES_IN ?? "1h", bcryptRounds };
}
