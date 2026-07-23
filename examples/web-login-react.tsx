/**
 * Example: React Login Component
 * 
 * Contoh implementasi login UI dengan React untuk Web Application.
 * Bisa di-adapt untuk Next.js, Remix, atau framework React lainnya.
 * 
 * Install dependencies:
 *   npm install gomerch-pg react
 */

import React, { useState } from 'react';
import { GopayMerchant, LoginService } from 'gomerch-pg';

interface LoginState {
  step: 'phone' | 'otp' | 'success';
  phone: string;
  countryCode: string;
  otp: string;
  otpToken: string;
  loading: boolean;
  error: string;
  session?: any;
  merchants?: Array<{
    id: string;
    merchantName: string;
    outletName: string;
  }>;
}

export function GopayLogin() {
  const [state, setState] = useState<LoginState>({
    step: 'phone',
    phone: '',
    countryCode: '62',
    otp: '',
    otpToken: '',
    loading: false,
    error: '',
  });

  // Initialize LoginService (di real app, gunakan useMemo atau singleton)
  const gopay = new GopayMerchant();
  const loginService = new LoginService({
    gopay,
    onOtpSent: async (phone, code) => {
      console.log(`OTP sent to +${code}${phone}`);
    },
    onLoginSuccess: async (session) => {
      // Save to localStorage
      localStorage.setItem('gopay_session', JSON.stringify(session));
      console.log('Session saved to localStorage');
    },
    onError: async (error, step) => {
      console.error(`Error at ${step}:`, error);
    }
  });

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setState(s => ({ ...s, loading: true, error: '' }));

    try {
      const result = await loginService.requestOtp({
        phoneNumber: state.phone,
        countryCode: state.countryCode
      });

      setState(s => ({
        ...s,
        loading: false,
        step: 'otp',
        otpToken: result.otpToken || ''
      }));
    } catch (error: any) {
      setState(s => ({
        ...s,
        loading: false,
        error: error.message || 'Failed to send OTP'
      }));
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setState(s => ({ ...s, loading: true, error: '' }));

    try {
      const result = await loginService.verifyOtpAndLogin({
        otp: state.otp,
        otpToken: state.otpToken,
        phoneNumber: state.phone,
        countryCode: state.countryCode
      });

      if (result.success) {
        setState(s => ({
          ...s,
          loading: false,
          step: 'success',
          session: result.session,
          merchants: result.merchants
        }));
      } else {
        setState(s => ({
          ...s,
          loading: false,
          error: result.error || 'Login failed'
        }));
      }
    } catch (error: any) {
      setState(s => ({
        ...s,
        loading: false,
        error: error.message || 'Failed to verify OTP'
      }));
    }
  };

  // Step 1: Phone Number Input
  if (state.step === 'phone') {
    return (
      <div className="login-container">
        <h2>GoPay Merchant Login</h2>
        <form onSubmit={handleRequestOtp}>
          <div className="form-group">
            <label>Country Code</label>
            <input
              type="text"
              value={state.countryCode}
              onChange={(e) => setState(s => ({ ...s, countryCode: e.target.value }))}
              placeholder="62"
              disabled={state.loading}
            />
          </div>
          
          <div className="form-group">
            <label>Phone Number</label>
            <input
              type="tel"
              value={state.phone}
              onChange={(e) => setState(s => ({ ...s, phone: e.target.value }))}
              placeholder="81234567890"
              required
              disabled={state.loading}
            />
          </div>

          {state.error && (
            <div className="error-message">{state.error}</div>
          )}

          <button type="submit" disabled={state.loading || !state.phone}>
            {state.loading ? 'Sending OTP...' : 'Send OTP'}
          </button>
        </form>
      </div>
    );
  }

  // Step 2: OTP Verification
  if (state.step === 'otp') {
    return (
      <div className="login-container">
        <h2>Enter OTP Code</h2>
        <p>OTP has been sent to +{state.countryCode}{state.phone}</p>
        
        <form onSubmit={handleVerifyOtp}>
          <div className="form-group">
            <label>OTP Code</label>
            <input
              type="text"
              value={state.otp}
              onChange={(e) => setState(s => ({ ...s, otp: e.target.value }))}
              placeholder="123456"
              maxLength={6}
              required
              disabled={state.loading}
              autoFocus
            />
          </div>

          {state.error && (
            <div className="error-message">{state.error}</div>
          )}

          <button type="submit" disabled={state.loading || state.otp.length < 6}>
            {state.loading ? 'Verifying...' : 'Verify OTP'}
          </button>

          <button
            type="button"
            onClick={() => setState(s => ({ ...s, step: 'phone', otp: '', error: '' }))}
            disabled={state.loading}
          >
            Change Phone Number
          </button>
        </form>
      </div>
    );
  }

  // Step 3: Success
  if (state.step === 'success') {
    return (
      <div className="login-container">
        <h2>Login Successful!</h2>
        
        {state.merchants && state.merchants.length > 0 && (
          <div className="merchants-list">
            <h3>Your Merchants:</h3>
            {state.merchants.map((merchant, i) => (
              <div key={merchant.id} className="merchant-card">
                <h4>{merchant.merchantName}</h4>
                <p>ID: {merchant.id}</p>
                <p>Outlet: {merchant.outletName}</p>
              </div>
            ))}
          </div>
        )}

        <div className="session-info">
          <p>Device ID: {state.session?.deviceId}</p>
          <p>Session saved to localStorage</p>
        </div>

        <button onClick={() => window.location.href = '/dashboard'}>
          Go to Dashboard
        </button>
      </div>
    );
  }

  return null;
}

/**
 * Contoh penggunaan di Next.js App Router:
 * 
 * // app/login/page.tsx
 * import { GopayLogin } from '@/components/GopayLogin';
 * 
 * export default function LoginPage() {
 *   return <GopayLogin />;
 * }
 * 
 * 
 * Contoh load session di page lain:
 * 
 * // app/dashboard/page.tsx
 * 'use client';
 * 
 * import { useEffect, useState } from 'react';
 * import { GopayMerchant } from 'gomerch-pg';
 * 
 * export default function Dashboard() {
 *   const [gopay, setGopay] = useState<GopayMerchant | null>(null);
 * 
 *   useEffect(() => {
 *     const sessionJson = localStorage.getItem('gopay_session');
 *     if (sessionJson) {
 *       const session = JSON.parse(sessionJson);
 *       const instance = new GopayMerchant({
 *         session,
 *         merchantId: 'G929951431',
 *         onTokenRefreshed: async (updatedSession) => {
 *           localStorage.setItem('gopay_session', JSON.stringify(updatedSession));
 *         }
 *       });
 *       setGopay(instance);
 *     }
 *   }, []);
 * 
 *   if (!gopay) return <div>Loading...</div>;
 * 
 *   return <div>Dashboard Content</div>;
 * }
 */
