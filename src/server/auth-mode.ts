export const RUNTIME_AUTH_MODE_ENV = "COVEN_MEMORY_RUNTIME_AUTH_MODE";

const DEVELOPMENT_AUTH_MODE = "development";
const STRICT_AUTH_MODE = "strict";

export function normalizeNodeEnvironment(
  nodeEnvironment: string | undefined
): string | undefined {
  return nodeEnvironment;
}

export function configureRuntimeAuthMode(
  nodeEnvironment: string | undefined
): void {
  process.env[RUNTIME_AUTH_MODE_ENV] =
    nodeEnvironment === DEVELOPMENT_AUTH_MODE
      ? DEVELOPMENT_AUTH_MODE
      : STRICT_AUTH_MODE;
}

export function isDevelopmentAuthMode(): boolean {
  return process.env[RUNTIME_AUTH_MODE_ENV] === DEVELOPMENT_AUTH_MODE;
}
