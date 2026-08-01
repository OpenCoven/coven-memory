import {
  configureRuntimeAuthMode,
  isDevelopmentAuthMode,
  normalizeNodeEnvironment,
  RUNTIME_AUTH_MODE_ENV
} from "./auth-mode";

describe("runtime auth mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("preserves an unset external environment and enables strict auth", () => {
    vi.stubEnv(RUNTIME_AUTH_MODE_ENV, "development");

    const environment = normalizeNodeEnvironment(undefined);
    configureRuntimeAuthMode(environment);

    expect(environment).toBeUndefined();
    expect(process.env[RUNTIME_AUTH_MODE_ENV]).toBe("strict");
    expect(isDevelopmentAuthMode()).toBe(false);
  });

  it("preserves the explicit development environment and enables dev auth", () => {
    vi.stubEnv(RUNTIME_AUTH_MODE_ENV, "strict");

    const environment = normalizeNodeEnvironment("development");
    configureRuntimeAuthMode(environment);

    expect(environment).toBe("development");
    expect(process.env[RUNTIME_AUTH_MODE_ENV]).toBe("development");
    expect(isDevelopmentAuthMode()).toBe(true);
  });

  it.each(["test", "production", "staging"])(
    "preserves explicit %s and overwrites a preexisting bypass with strict mode",
    (nodeEnvironment) => {
      vi.stubEnv(RUNTIME_AUTH_MODE_ENV, "development");

      const environment = normalizeNodeEnvironment(nodeEnvironment);
      configureRuntimeAuthMode(environment);

      expect(environment).toBe(nodeEnvironment);
      expect(process.env[RUNTIME_AUTH_MODE_ENV]).toBe("strict");
      expect(isDevelopmentAuthMode()).toBe(false);
    }
  );
});
