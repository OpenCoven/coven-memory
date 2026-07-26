import { resolveListenOptions } from "./listen-options";

describe("resolveListenOptions", () => {
  it("defaults to an explicit IPv4 loopback listener", () => {
    expect(resolveListenOptions({})).toEqual({
      hostname: "127.0.0.1",
      originHost: "127.0.0.1",
      port: 3737
    });
  });

  it("accepts and formats explicit IPv6 loopback", () => {
    expect(resolveListenOptions({ HOST: "::1", PORT: "4000" })).toEqual({
      hostname: "::1",
      originHost: "[::1]",
      port: 4000
    });
  });

  it.each(["0.0.0.0", "::", "localhost", "192.168.1.12", "example.test"])(
    "rejects non-explicit-loopback HOST=%s",
    (hostname) => {
      expect(() => resolveListenOptions({ HOST: hostname })).toThrow(
        /explicit loopback/
      );
    }
  );

  it.each(["0", "-1", "1.5", "70000", "not-a-port", " 3737 "])(
    "rejects invalid PORT=%s",
    (port) => {
      expect(() => resolveListenOptions({ PORT: port })).toThrow(/port/);
    }
  );
});
