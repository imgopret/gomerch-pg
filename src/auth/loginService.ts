/**
 * LoginService - Abstraction layer untuk login flow yang bisa digunakan di Web UI
 *
 * Class ini menyediakan API yang clean untuk implementasi login UI custom.
 * Developer bisa menggunakan ini untuk membuat halaman login sendiri (React, Vue, etc)
 * tanpa perlu menggunakan CLI interaktif.
 */

import type { GopayMerchant } from "../gopayMerchant.js";
import type { LoginRequestResult, SessionState } from "../core/types.js";

export interface LoginServiceConfig {
  /** GopayMerchant instance yang sudah dikonfigurasi */
  gopay: GopayMerchant;
  /** Callback dipanggil setelah OTP berhasil dikirim */
  onOtpSent?: (phone: string, countryCode: string) => void | Promise<void>;
  /** Callback dipanggil setelah login berhasil */
  onLoginSuccess?: (session: SessionState) => void | Promise<void>;
  /** Callback dipanggil jika terjadi error */
  onError?: (error: Error, step: LoginStep) => void | Promise<void>;
}

export type LoginStep = "request-otp" | "verify-otp" | "fetch-merchants";

export interface OtpRequestPayload {
  phoneNumber: string;
  countryCode?: string;
}

export interface OtpVerifyPayload {
  otp: string;
  otpToken: string;
  phoneNumber?: string;
  countryCode?: string;
}

export interface LoginResult {
  success: boolean;
  session?: SessionState;
  merchants?: Array<{
    id: string;
    merchantName: string;
    outletName: string;
    qrString?: string;
  }>;
  error?: string;
}

/**
 * LoginService - High-level abstraction untuk login flow
 *
 * Contoh penggunaan di React/Next.js:
 *
 * ```typescript
 * const gopay = new GopayMerchant();
 * const loginService = new LoginService({ gopay });
 *
 * // Step 1: Request OTP
 * const { otpToken } = await loginService.requestOtp({
 *   phoneNumber: '81234567890',
 *   countryCode: '62'
 * });
 *
 * // Step 2: Verify OTP
 * const result = await loginService.verifyOtpAndLogin({
 *   otp: '123456',
 *   otpToken,
 *   phoneNumber: '81234567890'
 * });
 *
 * if (result.success) {
 *   // Save session ke storage (localStorage, database, etc)
 *   await saveSession(result.session);
 * }
 * ```
 */
export class LoginService {
  private readonly gopay: GopayMerchant;
  private readonly config: LoginServiceConfig;
  private currentOtpToken?: string;
  private currentPhone?: string;

  constructor(config: LoginServiceConfig) {
    this.gopay = config.gopay;
    this.config = config;
  }

  /**
   * Step 1: Request OTP
   * Mengirim OTP ke nomor telepon yang diberikan
   */
  async requestOtp(payload: OtpRequestPayload): Promise<LoginRequestResult> {
    try {
      const { phoneNumber, countryCode = "62" } = payload;

      const result = await this.gopay.requestOtp(phoneNumber, countryCode);

      // Simpan untuk digunakan di step verify
      this.currentOtpToken = result.otpToken;
      this.currentPhone = phoneNumber;

      // Callback notification
      if (this.config.onOtpSent) {
        await this.config.onOtpSent(phoneNumber, countryCode);
      }

      return result;
    } catch (error) {
      if (this.config.onError) {
        await this.config.onError(error as Error, "request-otp");
      }
      throw error;
    }
  }

  /**
   * Step 2: Verify OTP dan complete login flow
   * Verifikasi OTP, ambil tokens, dan fetch merchant data
   */
  async verifyOtpAndLogin(payload: OtpVerifyPayload): Promise<LoginResult> {
    try {
      const { otp, otpToken, phoneNumber, countryCode } = payload;

      // Verify OTP dan dapatkan tokens
      await this.gopay.verifyOtp({
        otp,
        otpToken: otpToken || this.currentOtpToken || "",
        phoneNumber: phoneNumber || this.currentPhone,
        countryCode,
      });

      // Export session
      const session = this.gopay.exportSession();

      // Fetch merchants
      let merchants;
      try {
        merchants = await this.gopay.listMerchants();

        // Fallback ke single merchant dari profile jika search kosong
        if (merchants.length === 0) {
          const profile = await this.gopay
            .getMerchantProfile()
            .catch(() => undefined);
          if (profile) {
            merchants = [
              {
                id: profile.id,
                merchantName: profile.merchantName,
                outletName: profile.outletName,
                phone: profile.phone,
                email: profile.email,
                outlets: profile.outlets,
                qrString: profile.outlets.find((o) => o.qrString)?.qrString,
                raw: profile.raw,
              },
            ];
          }
        }
      } catch (error) {
        if (this.config.onError) {
          await this.config.onError(error as Error, "fetch-merchants");
        }
        // Tidak throw error, karena login sudah berhasil
        // Merchant data bisa diambil lagi nanti
      }

      const result: LoginResult = {
        success: true,
        session,
        merchants: merchants?.map((m) => ({
          id: m.id,
          merchantName: m.merchantName,
          outletName: m.outletName || "",
          qrString: m.qrString,
        })),
      };

      // Callback notification
      if (this.config.onLoginSuccess) {
        await this.config.onLoginSuccess(session);
      }

      // Clear temporary state
      this.currentOtpToken = undefined;
      this.currentPhone = undefined;

      return result;
    } catch (error) {
      if (this.config.onError) {
        await this.config.onError(error as Error, "verify-otp");
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Utility: Verifikasi session yang sudah ada
   * Berguna untuk check apakah session masih valid
   */
  async validateSession(session: SessionState): Promise<boolean> {
    try {
      // Coba buat instance baru dengan session
      const testGopay = new (this.gopay.constructor as typeof GopayMerchant)({
        session,
        merchantId: undefined, // Tidak perlu merchantId untuk test
      });

      // Coba ambil merchant data untuk test session
      await testGopay.listMerchants();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current OTP token (untuk debugging atau retry)
   */
  getCurrentOtpToken(): string | undefined {
    return this.currentOtpToken;
  }

  /**
   * Get current phone number (untuk debugging atau retry)
   */
  getCurrentPhone(): string | undefined {
    return this.currentPhone;
  }
}

/**
 * Helper function: Create LoginService instance dengan konfigurasi minimal
 */
export function createLoginService(
  config?: Partial<LoginServiceConfig>,
): LoginService {
  // Import di dalam function untuk avoid circular dependency
  const { GopayMerchant } = require("../gopayMerchant.js");

  const gopay = config?.gopay || new GopayMerchant();

  return new LoginService({
    gopay,
    ...config,
  });
}
