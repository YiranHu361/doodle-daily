type RGB = [number, number, number];

const CAST_COLORS: Record<string, RGB> = {
  "Boss Blob": [138, 79, 214],
  Coin: [247, 200, 44],
  Robo: [61, 139, 255],
  Newsie: [255, 140, 40],
  "The Crowd": [76, 191, 86],
};

const SECTION_SKY: Record<string, RGB> = {
  tech: [214, 246, 255],
  money: [226, 255, 220],
  culture: [255, 225, 242],
  memes: [236, 228, 255],
};

const PAPER: RGB = [251, 247, 236];
const INK: RGB = [27, 23, 54];

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

export function drawPlaceholder(size: number, opts: { seed: string; cast: string[]; section: string }): Uint8Array {
  const rand = rng(hashSeed(opts.seed));
  const px = new Uint8Array(size * size * 3);
  const set = (x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 3;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
  };
  const sky = SECTION_SKY[opts.section] ?? PAPER;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grain = ((x * 7 + y * 13) % 11) - 5;
      const base = y < size * 0.62 ? sky : PAPER;
      set(x, y, [base[0] + grain, base[1] + grain, base[2] + grain].map((v) => Math.max(0, Math.min(255, v))) as RGB);
    }
  }
  const phase = rand() * Math.PI * 2;
  for (let x = 0; x < size; x++) {
    const top = Math.round(size * 0.66 + Math.sin(x / (size / 5) + phase) * size * 0.04);
    for (let y = top; y < size; y++) set(x, y, y - top < 3 ? INK : [96, 196, 84]);
  }
  const disc = (cx: number, cy: number, r: number, c: RGB) => {
    for (let y = Math.floor(cy - r - 3); y <= cy + r + 3; y++) {
      for (let x = Math.floor(cx - r - 3); x <= cx + r + 3; x++) {
        const d = Math.hypot(x - cx, y - cy) + Math.sin((x + y) * 0.7) * 0.8;
        if (d <= r) set(x, y, c);
        else if (d <= r + 3) set(x, y, INK);
      }
    }
  };
  const box = (cx: number, cy: number, w: number, h: number, c: RGB) => {
    for (let y = Math.floor(cy - h / 2 - 3); y <= cy + h / 2 + 3; y++) {
      for (let x = Math.floor(cx - w / 2 - 3); x <= cx + w / 2 + 3; x++) {
        const inside = Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= h / 2;
        set(x, y, inside ? c : INK);
      }
    }
  };
  disc(size * (0.78 + rand() * 0.1), size * 0.18, size * 0.09, [255, 214, 51]);
  const cast = opts.cast.length ? opts.cast : ["Newsie"];
  cast.forEach((name, i) => {
    const color = CAST_COLORS[name] ?? [180, 180, 180];
    const cx = size * ((i + 1) / (cast.length + 1)) + (rand() - 0.5) * size * 0.06;
    const cy = size * 0.6;
    const r = size * (cast.length > 2 ? 0.09 : 0.12);
    if (name === "Robo") box(cx, cy - r * 0.3, r * 1.6, r * 1.8, color);
    else if (name === "The Crowd") {
      disc(cx - r * 0.7, cy + r * 0.2, r * 0.5, color);
      disc(cx + r * 0.7, cy + r * 0.2, r * 0.5, color);
      disc(cx, cy - r * 0.4, r * 0.5, color);
    } else disc(cx, cy - r * 0.2, name === "Newsie" ? r * 0.7 : r, color);
    disc(cx - r * 0.3, cy - r * 0.4, Math.max(2, size * 0.008), INK);
    disc(cx + r * 0.3, cy - r * 0.4, Math.max(2, size * 0.008), INK);
  });
  return px;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function storedZlib(data: Uint8Array): Uint8Array {
  const blocks = Math.ceil(data.length / 65535) || 1;
  const out = new Uint8Array(2 + data.length + blocks * 5 + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535;
    const len = Math.min(65535, data.length - start);
    out[o++] = b === blocks - 1 ? 1 : 0;
    out[o++] = len & 0xff;
    out[o++] = len >>> 8;
    out[o++] = ~len & 0xff;
    out[o++] = (~len >>> 8) & 0xff;
    out.set(data.subarray(start, start + len), o);
    o += len;
  }
  const ad = adler32(data);
  out[o++] = ad >>> 24;
  out[o++] = (ad >>> 16) & 0xff;
  out[o++] = (ad >>> 8) & 0xff;
  out[o++] = ad & 0xff;
  return out;
}

async function zlib(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") return storedZlib(data);
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return storedZlib(data);
  }
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export async function encodePng(rgb: Uint8Array, size: number): Promise<Uint8Array> {
  const raw = new Uint8Array(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    raw.set(rgb.subarray(y * size * 3, (y + 1) * size * 3), y * (size * 3 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", await zlib(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
