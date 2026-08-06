import {describe, expect, it} from "vitest";

import {hasUrlObfuscation, isRegistrableMediaUrl} from "@/lib/media/url";

const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const DEL = String.fromCharCode(127);

describe("hasUrlObfuscation", () => {
  it.each([
    ["a backslash", "/\\evil.example.com/x.png"],
    ["an interior tab", `/${TAB}/evil.example.com/x.png`],
    ["an interior newline", `/${LF}/evil.example.com/x.png`],
    ["an interior carriage return", `/${CR}/evil.example.com/x.png`],
    ["a delete character", `/images/${DEL}logo.png`],
    ["a null byte", `/images/${String.fromCharCode(0)}logo.png`],
  ])("flags %s", (_case, value) => {
    expect(hasUrlObfuscation(value)).toBe(true);
  });

  it.each([
    "/images/showcase/logo.png",
    "https://cdn.example.com/logo.png",
    "/images/a-b_c.1/logo.png",
  ])("leaves %s alone", (value) => {
    expect(hasUrlObfuscation(value)).toBe(false);
  });
});

describe("isRegistrableMediaUrl", () => {
  it.each([
    "/images/showcase/logo.png",
    "/images/showcase/logo.PNG",
    "/images/logo.jpg",
    "/images/logo.jpeg",
    "/images/logo.webp",
    "/images/logo.avif",
  ])("accepts the site-relative raster path %s", (value) => {
    expect(isRegistrableMediaUrl(value)).toBe(true);
  });

  it.each([
    ["a javascript scheme", "javascript:alert(1)"],
    ["a data url", "data:image/png;base64,AAAA"],
    ["a protocol-relative host", "//evil.example.com/logo.png"],
    ["plain http", "http://cdn.example.com/logo.png"],
    // Remote https is legitimate for the JSON-LD sink but never for a render
    // target: the optimizer re-follows redirects without re-checking the host.
    ["a remote https host", "https://cdn.example.com/logo.png"],
    ["a backslash bypass", "/\\evil.example.com/logo.png"],
    ["a tab bypass", `/${TAB}/evil.example.com/logo.png`],
    ["a newline bypass", `/${LF}/evil.example.com/logo.png`],
    ["untrimmed input", " /images/logo.png"],
    ["a query string", "/images/logo.png?v=2"],
    ["a fragment", "/images/logo.png#x"],
    ["a traversal segment", "/images/../logo.png"],
    ["an svg", "/images/logo.svg"],
    ["an extensionless path", "/images/logo"],
    ["a bare filename", "images/logo.png"],
    ["an empty string", ""],
  ])("rejects %s", (_case, value) => {
    expect(isRegistrableMediaUrl(value)).toBe(false);
  });
});
