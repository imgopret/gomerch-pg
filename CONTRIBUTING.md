# Contributing to gomerch-pg

Terima kasih atas minat Anda untuk berkontribusi pada gomerch-pg!

## Cara Berkontribusi

### Melaporkan Bug

Jika Anda menemukan bug, silakan buat issue di GitHub dengan informasi:
- Deskripsi bug yang jelas
- Langkah-langkah untuk mereproduksi
- Versi Node.js dan package yang digunakan
- Error message atau log jika ada

### Mengajukan Feature Request

Silakan buat issue dengan label "enhancement" yang berisi:
- Deskripsi fitur yang diinginkan
- Use case atau alasan mengapa fitur ini berguna
- Contoh implementasi (jika ada)

### Pull Request

1. Fork repository ini
2. Buat branch untuk perubahan Anda: `git checkout -b feature/nama-fitur`
3. Commit perubahan Anda: `git commit -m 'Add: deskripsi perubahan'`
4. Push ke branch: `git push origin feature/nama-fitur`
5. Buat Pull Request

#### Guidelines Pull Request

- Pastikan code Anda lulus semua test: `npm test`
- Pastikan tidak ada TypeScript error: `npm run typecheck`
- Build berhasil: `npm run build`
- Ikuti code style yang ada
- Tambahkan test untuk fitur baru
- Update dokumentasi jika diperlukan

## Development Setup

```bash
# Clone repository
git clone https://github.com/yourusername/gomerch-pg.git
cd gomerch-pg

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Run examples
npx tsx examples/basic.ts
```

## Code Style

- Gunakan TypeScript
- Ikuti ESLint rules yang ada
- Gunakan Prettier untuk formatting (jika ada)
- Tulis komentar untuk code yang kompleks
- Dokumentasikan public API dengan JSDoc

## Testing

- Tulis unit test untuk logic baru
- Pastikan semua test pass sebelum submit PR
- Test coverage minimal 80% untuk code baru

## Commit Messages

Gunakan format commit message yang jelas:
- `Add: fitur baru`
- `Fix: perbaikan bug`
- `Update: perubahan/improvement`
- `Docs: update dokumentasi`
- `Refactor: refactoring code`
- `Test: tambah/update test`

## Questions?

Jika ada pertanyaan, silakan buat issue atau diskusi di GitHub.

## License

Dengan berkontribusi, Anda setuju bahwa kontribusi Anda akan dilisensikan di bawah MIT License.
