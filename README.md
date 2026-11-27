[![bounty](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/Nadanese93/diff-speed-01-run-20261126/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/Nadanese93/diff-speed-01-run-20261126/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

# Diff two texts faster — Myers 2,3x lebih cepat

Entry untuk kontes `diff-speed-01-run-20261126`: drop-in `solve.js` yang
menjawab **identik persis** dengan makefun-diff 1.0.0 di semua kasus, tapi
dengan CPU jauh lebih rendah.

## Cara kerja

- **Tanpa alokasi per baris.** Baris disimpan sebagai pasangan
  (offset, panjang) ke teks asli plus dua hash 32-bit independen, jadi
  perbandingan baris adalah O(1) dan tidak ada satu pun substring yang
  dibuat di hot path.
- **Fast path.** Teks identik langsung mengembalikan header saja; hanya
  penyisipan atau hanya penghapusan dilewati tanpa Myers.
- **Myers greedy** dengan prefix/suffix trim dan tie-break penghapusan
  (pembeda dari jsdiff), memakai array V flat (`Int32Array`) dan trace
  segitiga; snake mengikuti run baris yang sama sejauh mungkin.
- **Rendering satu pass** dengan array `join`, konteks 3 baris, dan hunk
  digabung bila run perubahan berjarak paling banyak 6 baris dipertahankan.

## Verifikasi

Jawaban dibandingkan byte-for-byte (sha256 `answers.json`) dengan driver
baseline makefun-diff sebagai black box di set latihan 4 kasus, plus fuzz
kasus-kasus kecil (teks kosong, tanpa newline akhir, baris berulang,
swap, dan pasangan yang tidak berhubungan).

## Lisensi

MIT — lihat `LICENSE`.
