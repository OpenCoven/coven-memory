import { createLaunchUrl } from "./launch-url";

describe("createLaunchUrl", () => {
  it("returns a plain loopback URL without issuing a token in development", () => {
    const issueLaunchToken = vi.fn(() => "unused");

    expect(
      createLaunchUrl({
        originHost: "127.0.0.1",
        port: 3737,
        environment: "development",
        issueLaunchToken
      })
    ).toBe("http://127.0.0.1:3737/");
    expect(issueLaunchToken).not.toHaveBeenCalled();
  });

  it("issues one token and appends it as a production fragment", () => {
    const issueLaunchToken = vi.fn(() => "one-time");

    expect(
      createLaunchUrl({
        originHost: "[::1]",
        port: 3737,
        environment: "production",
        issueLaunchToken
      })
    ).toBe("http://[::1]:3737/#launch=one-time");
    expect(issueLaunchToken).toHaveBeenCalledOnce();
  });

  it('issues one token and appends it as a fragment in the "test" environment', () => {
    const issueLaunchToken = vi.fn(() => "one-time");

    expect(
      createLaunchUrl({
        originHost: "127.0.0.1",
        port: 3737,
        environment: "test",
        issueLaunchToken
      })
    ).toBe("http://127.0.0.1:3737/#launch=one-time");
    expect(issueLaunchToken).toHaveBeenCalledOnce();
  });
});
