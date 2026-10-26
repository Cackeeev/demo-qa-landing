import { mkdir, writeFile, access } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../public/generated/", import.meta.url));
await mkdir(out, { recursive: true });
const rate = 22050;
const seconds = 32;
// Original synthesized ambient loops. No third-party recordings or network downloads.
const compositions = [
  {
    name: "night",
    chords: [
      [146.83, 174.61, 220],
      [130.81, 164.81, 196],
      [116.54, 146.83, 174.61],
      [130.81, 164.81, 196],
    ],
  },
  {
    name: "light",
    chords: [
      [130.81, 164.81, 196],
      [174.61, 220, 261.63],
      [146.83, 174.61, 220],
      [196, 246.94, 293.66],
    ],
  },
  {
    name: "rain",
    chords: [
      [164.81, 196, 246.94],
      [146.83, 174.61, 220],
      [130.81, 164.81, 196],
      [146.83, 185, 220],
    ],
  },
];
for (const composition of compositions) {
  const path = `${out}/${composition.name}.wav`;
  try {
    await access(path);
    continue;
  } catch {
    /* Generate only missing files. */
  }
  const samples = rate * seconds;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) {
    const time = index / rate;
    const chord = composition.chords[Math.floor(time / 8) % 4];
    const phase = time % 8;
    const envelope =
      Math.min(1, phase / 0.6, (8 - phase) / 0.8) *
      Math.min(1, time / 0.6, (seconds - time) / 1.2);
    let signal = 0;
    chord.forEach((note, voice) => {
      signal += Math.sin(2 * Math.PI * note * time + voice * 0.3) * 0.13;
      signal += Math.sin(2 * Math.PI * note * 2.001 * time) * 0.025;
    });
    const beat = time % 0.5;
    const arpeggio = chord[Math.floor(time * 2) % 3] * 2;
    signal +=
      Math.sin(2 * Math.PI * arpeggio * time) * Math.exp(-beat * 12) * 0.07;
    wav.writeInt16LE(
      Math.round(Math.max(-0.8, Math.min(0.8, signal * envelope)) * 32767),
      44 + index * 2,
    );
  }
  await writeFile(path, wav);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++)
    n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function chunk(type, data) {
  const name = Buffer.from(type);
  const payload = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of payload) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, output.length - 4);
  return output;
}
for (const size of [180, 192, 512]) {
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = x / size,
        py = y / size;
      let color = [
        199 + Math.round(15 * (1 - py)),
        201 + Math.round(14 * (1 - py)),
        202 + Math.round(13 * (1 - py)),
      ];
      if (px > 0.14 && px < 0.86 && py > 0.13 && py < 0.49)
        color = [24, 54 + Math.round(py * 30), 76];
      const circle = Math.hypot(px - 0.5, py - 0.73);
      if (circle < 0.18) color = [244, 242, 233];
      if (circle < 0.07) color = [177, 180, 181];
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      rows[offset] = color[0];
      rows[offset + 1] = color[1];
      rows[offset + 2] = color[2];
      rows[offset + 3] = 255;
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  await writeFile(
    `${out}/icon-${size}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(rows)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
console.log("Prepared 3 original 32-second audio demos and PWA icons.");
