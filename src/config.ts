export interface AppConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptRounds: number;
  /** Browser origins allowed to call the API. Empty (the default) means no cross-origin access. */
  corsOrigins: string[];
  /** Failed-attempt limit for login and sign-up, per IP address, per window. */
  authRateLimit: { windowMs: number; max: number };
  /** How many reverse proxies sit in front of the app (0 = none). Needed for correct client IPs on a host. */
  trustProxy: number;
}

function whole(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be a whole number between ${min} and ${max}`);
  }
  return n;
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

  // CORS is deliberate: only the exact origins listed here may call the API from a browser.
  // "*" is refused on purpose, and so is anything that is not a bare origin (scheme://host[:port]).
  const corsOrigins = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  for (const origin of corsOrigins) {
    let valid = false;
    try {
      valid = new URL(origin).origin === origin && origin !== "null";
    } catch {
      valid = false;
    }
    if (!valid) {
      throw new Error(
        `CORS_ORIGINS contains "${origin}". Use exact origins like https://app.example.com (no "*", no path, no trailing slash).`
      );
    }
  }

  return {
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? "1h",
    bcryptRounds: whole("BCRYPT_ROUNDS", env.BCRYPT_ROUNDS, 10, 4, 15),
    corsOrigins,
    authRateLimit: {
      windowMs: whole("AUTH_RATE_LIMIT_WINDOW_MINUTES", env.AUTH_RATE_LIMIT_WINDOW_MINUTES, 15, 1, 1440) * 60_000,
      max: whole("AUTH_RATE_LIMIT_MAX", env.AUTH_RATE_LIMIT_MAX, 10, 1, 10_000),
    },
    trustProxy: whole("TRUST_PROXY", env.TRUST_PROXY, 0, 0, 10),
  };
}
