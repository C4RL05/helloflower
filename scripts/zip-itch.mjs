/**
 * Package `dist/` into `helloflower-itch.zip` for itch.io (HTML5 upload):
 * `index.html` at the zip root, forward-slash entry names, source maps omitted.
 *
 * Dependency-free — writes the ZIP container by hand (store/deflate) using
 * Node's `zlib.crc32` + `deflateRawSync`. Run after `vite build`.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { deflateRawSync, crc32 } from "node:zlib";

const DIST = "dist";
const OUT = "helloflower-itch.zip";
const DOS_DATE = 0x21; // 1980-01-01 (a valid fixed timestamp)

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(DIST)
  .filter((f) => !f.endsWith(".map"))
  .sort(); // index.html sorts before its assets; order is cosmetic

const local = [];
const central = [];
let offset = 0;

for (const file of files) {
  const data = readFileSync(file);
  const name = relative(DIST, file).split(sep).join("/");
  const nameBytes = Buffer.from(name, "utf8");
  const crc = crc32(data) >>> 0;
  const body = deflateRawSync(data);

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); // local file header signature
  lh.writeUInt16LE(20, 4); // version needed
  lh.writeUInt16LE(0, 6); // flags
  lh.writeUInt16LE(8, 8); // method = deflate
  lh.writeUInt16LE(0, 10); // mod time
  lh.writeUInt16LE(DOS_DATE, 12); // mod date
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(body.length, 18); // compressed size
  lh.writeUInt32LE(data.length, 22); // uncompressed size
  lh.writeUInt16LE(nameBytes.length, 26);
  lh.writeUInt16LE(0, 28); // extra length
  local.push(lh, nameBytes, body);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); // central directory header signature
  ch.writeUInt16LE(20, 4); // version made by
  ch.writeUInt16LE(20, 6); // version needed
  ch.writeUInt16LE(0, 8); // flags
  ch.writeUInt16LE(8, 10); // method
  ch.writeUInt16LE(0, 12); // mod time
  ch.writeUInt16LE(DOS_DATE, 14); // mod date
  ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(body.length, 20);
  ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(nameBytes.length, 28);
  ch.writeUInt16LE(0, 30); // extra
  ch.writeUInt16LE(0, 32); // comment
  ch.writeUInt16LE(0, 34); // disk number
  ch.writeUInt16LE(0, 36); // internal attrs
  ch.writeUInt32LE(0, 38); // external attrs
  ch.writeUInt32LE(offset, 42); // local header offset
  central.push(ch, nameBytes);

  offset += lh.length + nameBytes.length + body.length;
}

const localBuf = Buffer.concat(local);
const centralBuf = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
eocd.writeUInt16LE(files.length, 8); // entries on this disk
eocd.writeUInt16LE(files.length, 10); // total entries
eocd.writeUInt32LE(centralBuf.length, 12); // central directory size
eocd.writeUInt32LE(localBuf.length, 16); // central directory offset

const zip = Buffer.concat([localBuf, centralBuf, eocd]);
writeFileSync(OUT, zip);
console.log(
  `wrote ${OUT} — ${files.length} files, ${Math.round(zip.length / 1024)} KB`,
);
for (const f of files) console.log("  " + relative(DIST, f).split(sep).join("/"));
