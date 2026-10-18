import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { deflateSync } from "node:zlib";
import { after, before, describe, it } from "node:test";

import { extractDominantColor, FALLBACK_DOMINANT_COLOR, isDecodableRaster } from "@/lib/scrape/color";

/**
 * Favicon bytes come from a site the buyer controls. The ASF case is the
 * one that matters: before the signature check, these 200 bytes hung the
 * whole process inside node-vibrant's `file-type`, out of reach of any
 * timeout. If it regresses, this file never finishes rather than failing
 * — which is the bug, made visible.
 */

/** ASF header GUID, declared size 200, then one sub-object of size 0. */
function maliciousAsf(): Buffer {
  const bytes = Buffer.alloc(200);
  Buffer.from([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c]).copy(bytes, 0);
  bytes.writeBigUInt64LE(BigInt(200), 16);
  bytes.fill(0x11, 30, 46);
  bytes.writeBigUInt64LE(BigInt(0), 46);
  return bytes;
}

function crc32(bytes: Buffer): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A 16x16 solid-color RGB PNG. */
function solidPng(r: number, g: number, b: number): Buffer {
  const size = 16;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("dominant color extraction", () => {
  let server: Server;
  let base: string;

  before(async () => {
    server = createServer((req, res) => {
      if (req.url === "/evil.ico") return res.end(maliciousAsf());
      if (req.url === "/red.png") return res.end(solidPng(220, 30, 30));
      if (req.url === "/icon.svg") return res.end('<svg xmlns="http://www.w3.org/2000/svg"/>');
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("only accepts raster signatures node-vibrant can decode", () => {
    assert.equal(isDecodableRaster(solidPng(0, 0, 0)), true);
    assert.equal(isDecodableRaster(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), true);
    assert.equal(isDecodableRaster(Buffer.from("GIF89a")), true);
    assert.equal(isDecodableRaster(Buffer.from("BM")), true);
    assert.equal(isDecodableRaster(maliciousAsf()), false);
    assert.equal(isDecodableRaster(Buffer.from("<svg")), false);
    assert.equal(isDecodableRaster(Buffer.from([0x00, 0x00, 0x01, 0x00])), false); // ICO
    assert.equal(isDecodableRaster(Buffer.alloc(0)), false);
  });

  it("skips a crafted ASF file instead of hanging, and moves on to the next candidate", async () => {
    const color = await extractDominantColor([`${base}/evil.ico`, `${base}/red.png`]);
    assert.notEqual(color, FALLBACK_DOMINANT_COLOR);
  });

  it("falls back to the neutral color when no candidate is decodable", async () => {
    const color = await extractDominantColor([`${base}/evil.ico`, `${base}/icon.svg`, `${base}/missing.png`]);
    assert.equal(color, FALLBACK_DOMINANT_COLOR);
  });
});
