import {
  createLocalTransportAuthority,
  LOCAL_TRANSPORT_HEADER
} from "./local-transport";

describe("local transport authority", () => {
  const proof = Buffer.alloc(32, 7);

  it("replaces a spoofed proof for an exact loopback socket peer", () => {
    const authority = createLocalTransportAuthority(proof);
    const headers: Record<string, string | string[] | undefined> = {
      [LOCAL_TRANSPORT_HEADER]: "attacker-controlled"
    };

    expect(authority.authorize(headers, "127.0.0.1")).toBe(true);
    expect(headers[LOCAL_TRANSPORT_HEADER]).not.toBe("attacker-controlled");
    expect(
      authority.validate(
        new Headers({
          [LOCAL_TRANSPORT_HEADER]: String(headers[LOCAL_TRANSPORT_HEADER])
        })
      )
    ).toBe(true);
  });

  it.each(["::1", "::ffff:127.0.0.1"])(
    "accepts the loopback socket form %s",
    (remoteAddress) => {
      const authority = createLocalTransportAuthority(proof);
      const headers: Record<string, string | string[] | undefined> = {};

      expect(authority.authorize(headers, remoteAddress)).toBe(true);
      expect(authority.validate(new Headers(headers as Record<string, string>))).toBe(
        true
      );
    }
  );

  it.each([undefined, "100.66.68.73", "192.168.1.12", "127.0.0.2"])(
    "rejects a non-explicit-loopback peer %s and removes spoofed proof",
    (remoteAddress) => {
      const authority = createLocalTransportAuthority(proof);
      const headers: Record<string, string | string[] | undefined> = {
        [LOCAL_TRANSPORT_HEADER]: "attacker-controlled"
      };

      expect(authority.authorize(headers, remoteAddress)).toBe(false);
      expect(headers[LOCAL_TRANSPORT_HEADER]).toBeUndefined();
    }
  );

  it("rejects missing, guessed, duplicated, and stale proofs", () => {
    const authority = createLocalTransportAuthority(proof);
    const stale = createLocalTransportAuthority(Buffer.alloc(32, 8));
    const authorized: Record<string, string | string[] | undefined> = {};
    const staleHeaders: Record<string, string | string[] | undefined> = {};
    authority.authorize(authorized, "127.0.0.1");
    stale.authorize(staleHeaders, "127.0.0.1");

    expect(authority.validate(new Headers())).toBe(false);
    expect(
      authority.validate(
        new Headers({ [LOCAL_TRANSPORT_HEADER]: "not-the-proof" })
      )
    ).toBe(false);
    expect(
      authority.validate(
        new Headers({
          [LOCAL_TRANSPORT_HEADER]: `${String(
            authorized[LOCAL_TRANSPORT_HEADER]
          )}, duplicate`
        })
      )
    ).toBe(false);
    expect(
      authority.validate(
        new Headers({
          [LOCAL_TRANSPORT_HEADER]: String(
            staleHeaders[LOCAL_TRANSPORT_HEADER]
          )
        })
      )
    ).toBe(false);
  });
});
