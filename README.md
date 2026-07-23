# gomerch-pg

Payment gateway tidak resmi untuk **GoPay Merchant / GoBiz** (Indonesia), ditulis dalam TypeScript untuk Node.js.

GoPay Merchant adalah produk penerimaan pembayaran berbasis QRIS tanpa API pembayaran publik. Library ini merekonstruksi alur yang digunakan oleh dashboard merchant GoBiz resmi untuk:

1. Mengubah QRIS GoPay **statis** menjadi string QRIS **dinamis** per pesanan.
2. Membuat setiap jumlah pesanan **unik** (nominal dasar + offset terkecil yang tersedia) sehingga pesanan bersamaan dengan nominal sama dapat dibedakan.
3. **Mendeteksi settlement** dengan melakukan polling pada feed transaksi merchant GoBiz dan mencocokkan berdasarkan jumlah eksak dalam jendela waktu tertentu.

Pembayaran langsung masuk ke akun GoPay merchant Anda sendiri. Tanpa biaya payment gateway pihak ketiga, tanpa potongan admin ke pembeli atau merchant (MDR GoPay tetap berlaku untuk transaksi besar sesuai ketentuan GoPay).

> Ini adalah klien tidak resmi yang direkayasa balik. Endpoint dan header dapat berubah tanpa pemberitahuan. Gunakan dengan risiko Anda sendiri dan hanya dengan akun yang Anda miliki.

## Fitur Utama

- **Refresh Token Otomatis** - Manajemen token tanpa konfigurasi dengan refresh proaktif sebelum kedaluwarsa
- **Alokasi Nominal Cerdas** - Nominal unik dinamis untuk pembayaran bersamaan
- **Deteksi Pembayaran** - Deteksi settlement real-time melalui polling transaksi
- **Manajemen Sesi Aman** - Device ID stabil dan sesi persisten
- **Penyimpanan Fleksibel** - In-memory atau custom durable payment store
- **CLI Tools** - Login interaktif dan manajemen merchant

## Cara Kerja Nominal Unik

Dua pesanan dengan nominal Rp10.000 akan menjadi:

```
10.001   (offset 1)
10.002   (offset 2)
```

Offset adalah bilangan bulat terkecil yang tersedia dalam rentang `[1, maxUniqueOffset]` untuk nominal dasar tersebut. Ketika pembayaran dibayar, kedaluwarsa, atau dibatalkan, slot tersebut akan dilepas dan digunakan kembali oleh pesanan berikutnya, selalu memilih slot terkecil terlebih dahulu.

## Instalasi

```bash
npm install gomerch-pg
```

## CLI (`gomerch`)

Setelah instalasi, perintah `gomerch` tersedia. Login bersifat interaktif (nomor telepon + OTP via CLI) dan sesi yang dihasilkan disimpan ke file konfigurasi JSON (`~/.gomerch/config.json` secara default, dapat diubah dengan variabel lingkungan `GOMERCH_CONFIG`).

```bash
gomerch login          # meminta nomor telepon + OTP; menyimpan token + semua merchant (dengan QRIS)
gomerch whoami         # path konfigurasi, status login, ringkasan merchant
gomerch session        # menampilkan sesi autentikasi yang tersimpan (hanya token)
gomerch merchants      # daftar merchant, outlet, dan QRIS yang tersimpan
gomerch set-merchant G929951431   # memilih merchant default (untuk akun multi-merchant)
```

Saat login, klien mengambil semua merchant yang dapat diakses akun melalui endpoint `/v1/merchants/search` (masing-masing dengan detail lengkap dan QRIS outlet di `pops[].gopay.aspi_qr_string`) dan menyimpannya. Struktur konfigurasi adalah sebagai berikut:

```jsonc
{
  "session": {
    "tokens": {
      "accessToken": "...",
      "refreshToken": "...",
      "tokenType": "Bearer",
    },
  },
  "merchants": [
    {
      "id": "G929951431",
      "merchantName": "ATMOSPREM",
      "outletName": "GOPRETSUTDIO",
      "outlets": [{ "popId": "...", "name": "...", "qrString": "00020101..." }],
      "qrString": "00020101...",
      "raw": {
        /* full merchant payload */
      },
    },
  ],
  "defaultMerchantId": "G929951431",
}
```

`session` hanya menyimpan autentikasi; merchant disimpan dalam array terpisah sehingga akun dengan beberapa merchant dapat menyimpan detail lengkap untuk masing-masing.

Contoh sesi login:

```
$ gomerch login
Nomor telepon (tanpa kode negara, contoh: 81234567890): 81234567890
Kode negara [62]: 62
Meminta OTP...
Masukkan OTP yang Anda terima: 123456

Login berhasil. Konfigurasi disimpan ke /home/you/.gomerch/config.json
Merchant ditemukan: 1 (G929951431:ATMOSPREM)
Static QRIS berhasil di-resolve untuk 1/1 merchant.
```

Kode Anda kemudian memuat konfigurasi yang tersimpan tanpa perlu hardcode apapun:

```ts
import { GopayMerchant, createConsoleLogger } from "gomerch-pg";
import { readConfig } from "gomerch-pg/dist/cli/config.js";

const config = readConfig();
const merchant =
  config.merchants?.find((m) => m.id === config.defaultMerchantId) ??
  config.merchants?.[0];
const gopay = new GopayMerchant({
  merchantId: merchant.id,
  staticQris: merchant.qrString,
  session: config.session,
  logger: createConsoleLogger("info"),
});
```

## Panduan Cepat Programmatic

```ts
import { GopayMerchant } from "gomerch-pg";

const gopay = new GopayMerchant({
  merchantId: "G929951431",
  staticQris: "00020101021126...", // payload QRIS statis merchant Anda
});

// 1. Login (alur OTP GoID)
await gopay.requestOtp("81234567890"); // mengirim OTP via SMS/WhatsApp
await gopay.verifyOtp({ phoneNumber: "81234567890", otp: "123456" });

// Simpan sesi agar tidak perlu login setiap kali
const session = gopay.exportSession();
// ...simpan `session` ke penyimpanan persisten...

// 2. Mulai deteksi pembayaran
const payments = gopay.payments();
payments.on("paid", (p) =>
  console.log("DIBAYAR", p.id, p.uniqueAmount, p.transaction?.id),
);
payments.on("expired", (p) => console.log("KEDALUWARSA", p.id));
payments.on("error", (e) => console.error(e));
payments.start();

// 3. Buat pembayaran untuk pesanan senilai Rp10.000
const payment = await gopay.createPayment({
  amount: 10_000,
  reference: "order-42",
});
console.log(payment.uniqueAmount); // contoh: 10001
console.log(payment.qrString); // QRIS dinamis untuk di-render sebagai QR code
```

## Memulihkan Sesi

```ts
const gopay = new GopayMerchant({
  merchantId: "G929951431",
  staticQris,
  session, // objek yang dikembalikan oleh gopay.exportSession()
});

// refresh access token jika diperlukan (biasanya otomatis)
await gopay.refreshSession();
```

## Refresh Token Otomatis

**Tanpa konfigurasi apapun!** Access token secara otomatis di-refresh sebelum kedaluwarsa dan secara transparan melakukan retry pada error 401.

### Cara Kerja

1. **Proactive Refresh** - Token di-refresh 5 menit sebelum kedaluwarsa (dapat dikonfigurasi)
2. **Reactive Refresh** - Retry otomatis pada response 401 Unauthorized
3. **Concurrent Deduplication** - Multiple request berbagi satu operasi refresh yang sama
4. **Stable Device ID** - Persisten lintas sesi untuk kepatuhan keamanan

### Penggunaan Dasar (auto-refresh aktif secara default)

```ts
const gopay = new GopayMerchant({
  session: savedSession,
  merchantId: "G929951431",
});

// Token di-refresh secara otomatis dan transparan - tidak perlu refresh manual!
await gopay.getMerchantProfile();
await gopay.listMerchants();
```

### Dengan Auto-Save saat Refresh

```ts
import { writeFileSync } from "fs";

const gopay = new GopayMerchant({
  session: savedSession,
  merchantId: "G929951431",

  // Opsional: callback yang dipanggil setelah refresh token otomatis
  onTokenRefreshed: async (updatedSession) => {
    writeFileSync(".session.json", JSON.stringify(updatedSession, null, 2));
    console.log("✓ Token di-refresh dan disimpan");
  },

  // Opsional: sesuaikan waktu refresh (default: 5 menit)
  refreshBeforeExpiryMs: 10 * 60 * 1000, // buffer 10 menit
});
```

### Struktur Sesi

Sesi sekarang mencakup device ID stabil dan timestamp refresh:

```jsonc
{
  "tokens": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "tokenType": "Bearer",
    "expiresAt": 1234567890000, // epoch milliseconds
  },
  "deviceId": "stable-uuid-here", // dipertahankan lintas sesi
  "lastRefreshedAt": 1234567890000, // timestamp refresh terakhir
}
```

**Kompatibilitas mundur**: Sesi lama (tanpa `deviceId`) secara otomatis di-migrasi saat pertama kali digunakan.

## Login untuk Web UI

Library ini menyediakan `LoginService` untuk membuat UI login custom di web application (React, Vue, Next.js, dll). Developer dapat membuat halaman login sendiri tanpa perlu menggunakan CLI.

### Contoh: React/Next.js Login Component

```tsx
import { GopayMerchant, LoginService } from "gomerch-pg";
import { useState } from "react";

function LoginPage() {
  const [state, setState] = useState({ step: "phone", phone: "", otp: "" });

  const gopay = new GopayMerchant();
  const loginService = new LoginService({
    gopay,
    onLoginSuccess: async (session) => {
      // Save ke localStorage atau database
      localStorage.setItem("gopay_session", JSON.stringify(session));
    },
  });

  const handleRequestOtp = async () => {
    const result = await loginService.requestOtp({
      phoneNumber: state.phone,
      countryCode: "62",
    });
    setState({ ...state, step: "otp", otpToken: result.otpToken });
  };

  const handleVerifyOtp = async () => {
    const result = await loginService.verifyOtpAndLogin({
      otp: state.otp,
      otpToken: state.otpToken,
      phoneNumber: state.phone,
    });

    if (result.success) {
      // Login berhasil, redirect ke dashboard
      window.location.href = "/dashboard";
    }
  };

  // Render form sesuai step...
}
```

### Contoh: API untuk Backend

```ts
import { GopayMerchant, LoginService } from "gomerch-pg";

// POST /api/auth/request-otp
export async function requestOtp(req, res) {
  const { phone, countryCode } = req.body;

  const gopay = new GopayMerchant();
  const loginService = new LoginService({ gopay });

  const result = await loginService.requestOtp({
    phoneNumber: phone,
    countryCode: countryCode || "62",
  });

  res.json({ otpToken: result.otpToken });
}

// POST /api/auth/verify-otp
export async function verifyOtp(req, res) {
  const { otp, otpToken, phone } = req.body;

  const gopay = new GopayMerchant();
  const loginService = new LoginService({ gopay });

  const result = await loginService.verifyOtpAndLogin({
    otp,
    otpToken,
    phoneNumber: phone,
  });

  if (result.success) {
    // Save session ke database
    await db.sessions.create({
      userId: req.user.id,
      gopaySession: result.session,
    });

    res.json({
      success: true,
      merchants: result.merchants,
    });
  } else {
    res.status(401).json({
      success: false,
      error: result.error,
    });
  }
}
```

Lihat contoh lengkap di:

- `examples/web-login.ts` - Simulasi login CLI
- `examples/web-login-react.tsx` - React component lengkap

## Konfigurasi

| Opsi                      | Deskripsi                                                 | Default          |
| ------------------------- | --------------------------------------------------------- | ---------------- |
| `merchantId`              | ID Merchant, contoh: `G929951431`                         | —                |
| `staticQris`              | Payload QRIS statis untuk diturunkan menjadi QRIS dinamis | —                |
| `session`                 | Memulihkan `SessionState` sebelumnya                      | —                |
| `deviceId`                | Identifier device stabil (otomatis dibuat jika tidak ada) | random UUID      |
| `onTokenRefreshed`        | Callback yang dipanggil setelah refresh token otomatis    | —                |
| `refreshBeforeExpiryMs`   | Refresh token sekian ms sebelum kedaluwarsa               | `300000` (5 mnt) |
| `store`                   | Custom `PaymentStore` (backend persisten)                 | in-memory        |
| `payment.pollIntervalMs`  | Interval polling transaksi                                | `3000`           |
| `payment.defaultExpiryMs` | Jendela waktu validitas pembayaran                        | `300000`         |
| `payment.maxUniqueOffset` | Maksimal pembayaran bersamaan per nominal dasar           | `999`            |
| `payment.clockSkewMs`     | Toleransi saat mencocokkan waktu tx dengan jendela        | `60000`          |
| `requestTimeoutMs`        | Timeout HTTP                                              | `20000`          |
| `logger`                  | Implementasi `Logger`                                     | no-op            |
| `logger`                  | `Logger` implementation                                   | no-op            |

## Utilitas QRIS

Helper EMVCo/QRIS tersedia untuk penggunaan langsung:

```ts
import { staticToDynamicQris, isValidQrisChecksum, parseEmv } from "gomerch-pg";

const dynamic = staticToDynamicQris(staticPayload, 10001);
isValidQrisChecksum(dynamic); // true
```

`staticToDynamicQris` menyuntikkan tag `54` (jumlah transaksi), mengubah tag `01` (point of initiation) dari statis `11` menjadi dinamis `12`, dan menghitung ulang checksum CRC-16/CCITT (tag `63`).

## Penyimpanan Pembayaran Persisten

Untuk deployment multi-proses, implementasikan `PaymentStore` (didukung oleh Redis, SQL, dll.) dan berikan melalui opsi `store`. `InMemoryPaymentStore` default hanya untuk single-process.

```ts
import type { PaymentStore, Payment } from "gomerch-pg";

class RedisPaymentStore implements PaymentStore {
  async create(payment: Payment) {
    /* ... */
  }
  async update(payment: Payment) {
    /* ... */
  }
  async get(id: string) {
    /* ... */ return undefined;
  }
  async listActive() {
    /* ... */ return [];
  }
}
```

## Arsitektur

```
src/
  core/        konstanta, typed errors, tipe domain
  http/        JSON HTTP client berbasis undici
  api/         authClient, merchantClient, transactionClient
  qris/        EMVCo TLV parser + konverter statis->dinamis
  payment/     amountAllocator, paymentStore, paymentMatcher, paymentService
  utils/       logger, time, id, crc16
  gopayMerchant.ts   facade tingkat tinggi
  index.ts     ekspor publik
```

Deteksi berbasis polling: tidak ada webhook resmi. `PaymentService` mengambil transaksi terkini, merekonsiliasi dengan pembayaran pending (jumlah eksak + jendela waktu, satu transaksi per pembayaran), dan memancarkan event `paid` / `expired`.

## Pengembangan

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Penafian

Tidak berafiliasi dengan, didukung oleh, atau disponsori oleh Gojek/GoTo. Untuk tujuan edukasi dan integrasi personal dengan akun merchant Anda sendiri. Hormati ketentuan layanan GoPay.

## Lisensi

MIT
