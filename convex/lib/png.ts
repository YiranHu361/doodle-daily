import { encodePng } from "../providers/placeholder";
import { inflateZlib } from "./inflate";

type Decoded = { width: number; height: number; rgb: Uint8Array };

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") return inflateZlib(data);
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export async function decodePng(bytes: Uint8Array): Promise<Decoded | null> {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || sig.some((s, i) => bytes[i] !== s)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat: Uint8Array[] = [];
  while (o + 8 <= bytes.length) {
    const len = view.getUint32(o);
    const type = String.fromCharCode(bytes[o + 4], bytes[o + 5], bytes[o + 6], bytes[o + 7]);
    const data = bytes.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") {
      width = view.getUint32(o + 8);
      height = view.getUint32(o + 12);
      const depth = data[8];
      colorType = data[9];
      if (depth !== 8 || data[12] !== 0 || (colorType !== 2 && colorType !== 6)) return null;
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  if (!width || !height || idat.length === 0) return null;
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of idat) {
    joined.set(c, p);
    p += c.length;
  }
  const raw = await inflate(joined);
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  if (raw.length < height * (stride + 1)) return null;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = y * stride;
    const prev = out - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? pixels[out + x - bpp] : 0;
      const b = y > 0 ? pixels[prev + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[prev + x - bpp] : 0;
      const v = line[x];
      pixels[out + x] =
        filter === 0 ? v : filter === 1 ? v + a : filter === 2 ? v + b : filter === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c);
    }
  }
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < width * height; i++, j += bpp) {
    const alpha = bpp === 4 ? pixels[j + 3] / 255 : 1;
    for (let k = 0; k < 3; k++) rgb[i * 3 + k] = Math.round(pixels[j + k] * alpha + 255 * (1 - alpha));
  }
  return { width, height, rgb };
}

export function downscale(img: Decoded, size: number): Uint8Array {
  const out = new Uint8Array(size * size * 3);
  const sx = img.width / size;
  const sy = img.height / size;
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * img.width + xx) * 3;
          r += img.rgb[i];
          g += img.rgb[i + 1];
          b += img.rgb[i + 2];
          n++;
        }
      }
      const o = (y * size + x) * 3;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

export async function shrinkPng(bytes: Uint8Array, size: number): Promise<Uint8Array | null> {
  try {
    const img = await decodePng(bytes);
    if (!img) return null;
    if (img.width <= size && img.height <= size) return bytes;
    return await encodePng(downscale(img, size), size);
  } catch {
    return null;
  }
}
