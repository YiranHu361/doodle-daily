type Tree = { counts: Uint16Array; symbols: Uint16Array };

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function buildTree(lengths: ArrayLike<number>, offset: number, count: number): Tree {
  const counts = new Uint16Array(16);
  const symbols = new Uint16Array(count);
  for (let i = 0; i < count; i++) counts[lengths[offset + i]]++;
  counts[0] = 0;
  const offs = new Uint16Array(16);
  for (let i = 1, sum = 0; i < 16; i++) {
    offs[i] = sum;
    sum += counts[i];
  }
  for (let i = 0; i < count; i++) if (lengths[offset + i]) symbols[offs[lengths[offset + i]]++] = i;
  return { counts, symbols };
}

const FIXED_LIT = (() => {
  const l = new Uint8Array(288);
  l.fill(8, 0, 144);
  l.fill(9, 144, 256);
  l.fill(7, 256, 280);
  l.fill(8, 280, 288);
  return buildTree(l, 0, 288);
})();
const FIXED_DIST = buildTree(new Uint8Array(30).fill(5), 0, 30);

export function inflateRaw(src: Uint8Array): Uint8Array {
  let pos = 0;
  let bitBuf = 0;
  let bitCount = 0;
  let out = new Uint8Array(Math.max(1024, src.length * 4));
  let len = 0;
  const ensure = (n: number) => {
    if (len + n <= out.length) return;
    let size = out.length * 2;
    while (size < len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(out.subarray(0, len));
    out = next;
  };
  const bit = (): number => {
    if (bitCount === 0) {
      if (pos >= src.length) throw new Error("inflate: unexpected end");
      bitBuf = src[pos++];
      bitCount = 8;
    }
    const b = bitBuf & 1;
    bitBuf >>= 1;
    bitCount--;
    return b;
  };
  const bits = (n: number): number => {
    let v = 0;
    for (let i = 0; i < n; i++) v |= bit() << i;
    return v;
  };
  const decode = (t: Tree): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let l = 1; l < 16; l++) {
      code |= bit();
      const count = t.counts[l];
      if (code - count < first) return t.symbols[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new Error("inflate: bad code");
  };
  let final = 0;
  while (!final) {
    final = bit();
    const type = bits(2);
    if (type === 0) {
      bitBuf = 0;
      bitCount = 0;
      const n = src[pos] | (src[pos + 1] << 8);
      pos += 4;
      ensure(n);
      out.set(src.subarray(pos, pos + n), len);
      len += n;
      pos += n;
      continue;
    }
    let lit = FIXED_LIT;
    let dist = FIXED_DIST;
    if (type === 2) {
      const hlit = bits(5) + 257;
      const hdist = bits(5) + 1;
      const hclen = bits(4) + 4;
      const clens = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) clens[CLEN_ORDER[i]] = bits(3);
      const clTree = buildTree(clens, 0, 19);
      const lengths = new Uint8Array(hlit + hdist);
      for (let i = 0; i < hlit + hdist; ) {
        const sym = decode(clTree);
        if (sym < 16) lengths[i++] = sym;
        else {
          let repeat = 0;
          let value = 0;
          if (sym === 16) {
            value = lengths[i - 1];
            repeat = 3 + bits(2);
          } else if (sym === 17) repeat = 3 + bits(3);
          else repeat = 11 + bits(7);
          while (repeat--) lengths[i++] = value;
        }
      }
      lit = buildTree(lengths, 0, hlit);
      dist = buildTree(lengths, hlit, hdist);
    } else if (type !== 1) throw new Error("inflate: bad block type");
    for (;;) {
      const sym = decode(lit);
      if (sym === 256) break;
      if (sym < 256) {
        ensure(1);
        out[len++] = sym;
        continue;
      }
      const s = sym - 257;
      const length = LENGTH_BASE[s] + bits(LENGTH_EXTRA[s]);
      const ds = decode(dist);
      const distance = DIST_BASE[ds] + bits(DIST_EXTRA[ds]);
      ensure(length);
      for (let i = 0; i < length; i++) out[len + i] = out[len + i - distance];
      len += length;
    }
  }
  return out.subarray(0, len);
}

export function inflateZlib(src: Uint8Array): Uint8Array {
  if (src.length < 6 || (src[0] & 0x0f) !== 8) throw new Error("inflate: not zlib");
  return inflateRaw(src.subarray(2));
}
