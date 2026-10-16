import { describe, expect, it } from "vitest";
import { presignUrl, uriEncode } from "@/lib/storage/sigv4";

describe("SigV4 presigning (receipts in R2, 6B.9)", () => {
  it("matches AWS's documented presigned GET example", () => {
    const url = presignUrl({
      method: "GET",
      host: "examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      expiresIn: 86400,
      now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(url).toContain(
      "X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
    expect(url.startsWith("https://examplebucket.s3.amazonaws.com/test.txt?")).toBe(true);
  });

  it("encodes path segments but keeps slashes", () => {
    expect(uriEncode("/bucket/a b/é.jpg", true)).toBe("/bucket/a%20b/%C3%A9.jpg");
    expect(uriEncode("a/b")).toBe("a%2Fb");
  });
});
