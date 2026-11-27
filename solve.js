// Drop-in pengganti makefun-diff 1.0.0 yang lebih cepat, ditulis dari spesifikasi
// kompetisi (competition.yaml): Myers greedy dengan tie-break penghapusan,
// prefix/suffix trim, dan rendering patch makefun-diff/1.
//
// Ide kecepatan: baris direpresentasikan sebagai (offset, panjang) ke teks
// asli plus dua hash 32-bit independen per baris, jadi tidak ada satu pun
// substring per baris yang dialokasikan di hot path; semua perbandingan baris
// adalah perbandingan (panjang, hash1, hash2) O(1). Myers memakai array V
// flat (Int32Array) dengan trace segitiga, dan patch di-render satu pass
// dengan array join.

function splitLines(t) {
  const L = t.length;
  let nl = 0;
  let q = -1;
  while ((q = t.indexOf('\n', q + 1)) !== -1) nl++;
  const n = nl + (L > 0 && t.charCodeAt(L - 1) !== 10 ? 1 : 0);
  const start = new Int32Array(n);
  const len = new Int32Array(n);
  const h1 = new Int32Array(n);
  const h2 = new Int32Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const e = t.indexOf('\n', s);
    const end = e === -1 ? L : e + 1;
    start[i] = s;
    len[i] = end - s;
    let a = 2166136261;
    let b = 5381;
    for (let j = s; j < end; j++) {
      const c = t.charCodeAt(j);
      a ^= c;
      a = Math.imul(a, 16777619);
      b = (Math.imul(b, 33) + c) | 0;
    }
    h1[i] = a;
    h2[i] = b;
    s = end;
  }
  return { n, start, len, h1, h2 };
}

// Myers greedy atas baris tengah A[p..p+N) vs B[p..p+M), dibatasi pada
// diagonal k dalam [kLo, kHi]. Di luar band, kandidat dari diagonal tetangga
// dianggap tidak ada (hanya satu arah yang dipakai di tepi band).
// Mengembalikan {trace, D, K} saat mencapai kedua ujung, atau null bila
// d melewati dCap tanpa selesai.
function myersForward(A, B, p, N, M, kLo, kHi, dCap) {
  const maxD = N + M;
  const off = maxD;
  const Alen = A.len;
  const Ah1 = A.h1;
  const Ah2 = A.h2;
  const Blen = B.len;
  const Bh1 = B.h1;
  const Bh2 = B.h2;
  let vPrev = new Int32Array(2 * maxD + 1);
  let vCurr = new Int32Array(2 * maxD + 1);
  let trace = new Int32Array(4225);
  for (let d = 0; d <= maxD; d++) {
    if (d > dCap) return null;
    if ((d + 1) * (d + 1) > trace.length) {
      const nt = new Int32Array(trace.length * 2);
      nt.set(trace);
      trace = nt;
    }
    const base = d * d;
    let k = -d < kLo ? kLo : -d;
    if (((k - d) & 1) !== 0) k++;
    const kEnd = d < kHi ? d : kHi;
    for (; k <= kEnd; k += 2) {
      let x;
      if (k === -d || k === kLo) {
        x = vPrev[k + 1 + off];
      } else if (k === d || k === kHi) {
        x = vPrev[k - 1 + off] + 1;
      } else if (vPrev[k - 1 + off] + 1 < vPrev[k + 1 + off]) {
        x = vPrev[k + 1 + off];
      } else {
        // Seri: penghapusan yang diambil (pembeda dari jsdiff).
        x = vPrev[k - 1 + off] + 1;
      }
      let y = x - k;
      while (
        x < N && y < M &&
        Alen[p + x] === Blen[p + y] &&
        Ah1[p + x] === Bh1[p + y] &&
        Ah2[p + x] === Bh2[p + y]
      ) {
        x++;
        y++;
      }
      vCurr[k + off] = x;
      trace[base + k + d] = x;
      if (x >= N && y >= M) return { trace, D: d, K: k };
    }
    const tmp = vPrev;
    vPrev = vCurr;
    vCurr = tmp;
  }
  return null;
}

// Backtrack dari (D, K) lewat trace; pilihan dihitung ulang dengan aturan
// yang sama seperti forward. Mengembalikan ops dalam urutan maju plus
// rentang diagonal k sepanjang path (kMin/kMax).
function backtrack(trace, D, K, p, N, M) {
  const t = new Int32Array(N + M);
  const o = new Int32Array(N + M);
  const w = new Int32Array(N + M);
  let wp = N + M;
  let x = trace[D * D + K + D];
  let y = x - K;
  let d = D;
  let k = K;
  let kMin = K;
  let kMax = K;
  while (d > 0) {
    const prevBase = (d - 1) * (d - 1);
    let prevK;
    let isDel;
    if (k === -d) {
      prevK = k + 1;
      isDel = false;
    } else if (k === d) {
      prevK = k - 1;
      isDel = true;
    } else {
      const vDown = trace[prevBase + (k - 1) + (d - 1)];
      const vUp = trace[prevBase + (k + 1) + (d - 1)];
      if (vDown + 1 < vUp) {
        prevK = k + 1;
        isDel = false;
      } else {
        prevK = k - 1;
        isDel = true;
      }
    }
    const px = trace[prevBase + prevK + (d - 1)];
    const py = px - prevK;
    const ex = isDel ? px + 1 : px;
    const ey = isDel ? py : py + 1;
    for (let i = x - 1; i >= ex; i--) {
      --wp;
      t[wp] = 0;
      o[wp] = p + i;
      w[wp] = p + ey + (i - ex);
    }
    --wp;
    if (isDel) {
      t[wp] = 1;
      o[wp] = p + px;
      w[wp] = -1;
    } else {
      t[wp] = 2;
      o[wp] = -1;
      w[wp] = p + py;
    }
    x = px;
    y = py;
    k = prevK;
    d--;
    if (k < kMin) kMin = k;
    if (k > kMax) kMax = k;
  }
  // Snake awal dari (0,0).
  for (let i = x - 1; i >= 0; i--) {
    --wp;
    t[wp] = 0;
    o[wp] = p + i;
    w[wp] = p + i;
  }
  return { t, o, w, start: wp, count: N + M - wp, kMin, kMax };
}

// Myers atas baris tengah. Jalur cepat: pencarian banded — path diff nyata
// tinggal di koridor sempit di sekitar diagonal akhir (N-M), jadi band
// selebar koridor + margin 384 sudah jauh lebih lebar dari simpangan yang
// teramati (~20). Bila path mendekati tepi band, atau pencarian tidak
// selesai dalam batas, jatuh kembali ke Myers penuh: hasilnya tetap eksak.
function myers(A, B, p, N, M) {
  const drift = N - M;
  const kLo = (drift < 0 ? drift : 0) - 384;
  const kHi = (drift > 0 ? drift : 0) + 384;
  const fwd = myersForward(A, B, p, N, M, kLo, kHi, 12000);
  if (fwd) {
    const ops = backtrack(fwd.trace, fwd.D, fwd.K, p, N, M);
    if (ops.kMin - kLo >= 96 && kHi - ops.kMax >= 96) return ops;
  }
  const full = myersForward(A, B, p, N, M, -(N + M), N + M, N + M);
  return backtrack(full.trace, full.D, full.K, p, N, M);
}

function emitLine(out, old, nw, A, B, ty, oi, wi) {
  let txt;
  let st;
  let ln;
  if (ty === 2) {
    txt = nw;
    st = B.start[wi];
    ln = B.len[wi];
    out.push('+');
  } else if (ty === 1) {
    txt = old;
    st = A.start[oi];
    ln = A.len[oi];
    out.push('-');
  } else {
    txt = old;
    st = A.start[oi];
    ln = A.len[oi];
    out.push('=');
  }
  out.push(txt.slice(st, st + ln));
  if (txt.charCodeAt(st + ln - 1) !== 10) out.push('\n%\n');
}

function render(old, nw, A, B, t, oo, ww, nOps, n, m, dels, ins) {
  const runs = [];
  for (let i = 0; i < nOps;) {
    if (t[i] === 0) {
      i++;
      continue;
    }
    const s = i;
    while (i < nOps && t[i] !== 0) i++;
    runs.push(s, i);
  }
  // Gabungkan run yang jaraknya <= 6 baris dipertahankan ke satu hunk.
  const hunks = [];
  for (let r = 0; r < runs.length; r += 2) {
    const rs = runs[r];
    const re = runs[r + 1];
    if (hunks.length > 0 && rs - runs[r - 1] <= 6) {
      hunks[hunks.length - 1] = re + 3 < nOps ? re + 3 : nOps;
    } else {
      hunks.push(rs - 3 > 0 ? rs - 3 : 0, re + 3 < nOps ? re + 3 : nOps);
    }
  }
  const H = hunks.length / 2;
  const out = [
    'makefun-diff/1 old=' + n + ' new=' + m + ' hunks=' + H +
    ' deleted=' + dels + ' inserted=' + ins + '\n',
  ];
  let oldC = 0;
  let newC = 0;
  let h = 0;
  for (let i = 0; i < nOps; i++) {
    if (h < hunks.length && i === hunks[h]) {
      const hs = hunks[h];
      const he = hunks[h + 1];
      let ol = 0;
      let nl = 0;
      for (let j = hs; j < he; j++) {
        if (t[j] !== 2) ol++;
        if (t[j] !== 1) nl++;
      }
      out.push('@ ' + (oldC + 1) + ' ' + ol + ' ' + (newC + 1) + ' ' + nl + '\n');
      for (let j = hs; j < he;) {
        if (t[j] === 0) {
          emitLine(out, old, nw, A, B, 0, oo[j], ww[j]);
          oldC++;
          newC++;
          j++;
        } else {
          // Satu run perubahan: tulis semua penghapusan dulu, baru penyisipan.
          const rs = j;
          while (j < he && t[j] !== 0) j++;
          for (let k = rs; k < j; k++) {
            if (t[k] === 1) {
              emitLine(out, old, nw, A, B, 1, oo[k], ww[k]);
              oldC++;
            }
          }
          for (let k = rs; k < j; k++) {
            if (t[k] === 2) {
              emitLine(out, old, nw, A, B, 2, oo[k], ww[k]);
              newC++;
            }
          }
        }
      }
      i = he - 1;
      h += 2;
    } else {
      if (t[i] !== 2) oldC++;
      if (t[i] !== 1) newC++;
    }
  }
  return out.join('');
}

export function run(input) {
  const old = input.old;
  const nw = input.new;
  if (old === nw) {
    // Teks identik: hanya header, tanpa memecah baris.
    let n = 0;
    let idx = -1;
    while ((idx = old.indexOf('\n', idx + 1)) !== -1) n++;
    if (old.length > 0 && old.charCodeAt(old.length - 1) !== 10) n++;
    return 'makefun-diff/1 old=' + n + ' new=' + n + ' hunks=0 deleted=0 inserted=0\n';
  }
  const A = splitLines(old);
  const B = splitLines(nw);
  const n = A.n;
  const m = B.n;
  const Alen = A.len;
  const Ah1 = A.h1;
  const Ah2 = A.h2;
  const Blen = B.len;
  const Bh1 = B.h1;
  const Bh2 = B.h2;
  let p = 0;
  const pn = n < m ? n : m;
  while (
    p < pn &&
    Alen[p] === Blen[p] &&
    Ah1[p] === Bh1[p] &&
    Ah2[p] === Bh2[p]
  ) {
    p++;
  }
  let s = 0;
  while (s < n - p && s < m - p) {
    const ai = n - 1 - s;
    const bi = m - 1 - s;
    if (
      Alen[ai] === Blen[bi] &&
      Ah1[ai] === Bh1[bi] &&
      Ah2[ai] === Bh2[bi]
    ) {
      s++;
    } else {
      break;
    }
  }
  const N = n - p - s;
  const M = m - p - s;
  const total = n + m + 1;
  const t = new Int32Array(total);
  const oo = new Int32Array(total);
  const ww = new Int32Array(total);
  let w = 0;
  let dels = 0;
  let ins = 0;
  for (let i = 0; i < p; i++) {
    t[w] = 0;
    oo[w] = i;
    ww[w] = i;
    w++;
  }
  if (N === 0) {
    for (let j = 0; j < M; j++) {
      t[w] = 2;
      oo[w] = -1;
      ww[w] = p + j;
      w++;
      ins++;
    }
  } else if (M === 0) {
    for (let i = 0; i < N; i++) {
      t[w] = 1;
      oo[w] = p + i;
      ww[w] = -1;
      w++;
      dels++;
    }
  } else if (N === 1 && M === 1) {
    // Pergantian satu baris: kedua baris tengah pasti berbeda (trim
    // berhenti karena baris ini tidak sama), jadi script-nya - lalu +.
    t[w] = 1;
    oo[w] = p;
    ww[w] = -1;
    w++;
    dels++;
    t[w] = 2;
    oo[w] = -1;
    ww[w] = p;
    w++;
    ins++;
  } else {
    const mid = myers(A, B, p, N, M);
    for (let i = 0; i < mid.count; i++) {
      const src = mid.start + i;
      const ty = mid.t[src];
      t[w] = ty;
      oo[w] = mid.o[src];
      ww[w] = mid.w[src];
      w++;
      if (ty === 1) dels++;
      else if (ty === 2) ins++;
    }
  }
  for (let i = 0; i < s; i++) {
    t[w] = 0;
    oo[w] = n - s + i;
    ww[w] = m - s + i;
    w++;
  }
  return render(old, nw, A, B, t, oo, ww, w, n, m, dels, ins);
}
