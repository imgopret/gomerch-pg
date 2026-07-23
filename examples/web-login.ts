/**
 * Example: Web-based Login Flow
 * 
 * Contoh ini menunjukkan bagaimana menggunakan LoginService untuk membuat
 * UI login custom. Cocok untuk web application (React, Vue, Next.js, etc).
 * 
 * Flow:
 * 1. User input nomor telepon
 * 2. Request OTP (user terima SMS/WhatsApp)
 * 3. User input OTP
 * 4. Verify OTP dan dapatkan session
 * 5. Save session ke storage (localStorage, database, etc)
 */

import { GopayMerchant, LoginService } from '../src/index.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

const SESSION_FILE = './.web-session.json';

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Web-based Login Example');
  console.log('Simulasi login flow untuk Web UI');
  console.log('='.repeat(60));
  console.log();

  // Initialize GopayMerchant
  const gopay = new GopayMerchant();

  // Create LoginService dengan callbacks
  const loginService = new LoginService({
    gopay,
    
    // Callback saat OTP berhasil dikirim
    onOtpSent: async (phone, countryCode) => {
      console.log(`✓ OTP sent to +${countryCode}${phone}`);
      console.log('Check your SMS/WhatsApp for OTP code');
    },
    
    // Callback saat login berhasil
    onLoginSuccess: async (session) => {
      console.log('✓ Login successful!');
      console.log(`Device ID: ${session.deviceId}`);
      
      // Save session to file (dalam real app: localStorage, database, etc)
      writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
      console.log(`✓ Session saved to ${SESSION_FILE}`);
    },
    
    // Callback saat error
    onError: async (error, step) => {
      console.error(`✗ Error at step "${step}":`, error.message);
    }
  });

  try {
    // Step 1: Request OTP
    console.log('Step 1: Request OTP');
    console.log('-'.repeat(40));
    
    const phone = await prompt('Phone number (without country code, e.g. 81234567890): ');
    const countryCode = (await prompt('Country code [62]: ')) || '62';
    
    console.log('\nRequesting OTP...');
    const otpResult = await loginService.requestOtp({
      phoneNumber: phone,
      countryCode
    });
    
    console.log();

    // Step 2: Verify OTP
    console.log('Step 2: Verify OTP');
    console.log('-'.repeat(40));
    
    const otp = await prompt('Enter OTP code: ');
    
    console.log('\nVerifying OTP and logging in...');
    const loginResult = await loginService.verifyOtpAndLogin({
      otp,
      otpToken: otpResult.otpToken || '',
      phoneNumber: phone,
      countryCode
    });

    if (!loginResult.success) {
      console.error('\n✗ Login failed:', loginResult.error);
      process.exit(1);
    }

    console.log();
    console.log('='.repeat(60));
    console.log('Login Complete!');
    console.log('='.repeat(60));
    
    // Display merchants
    if (loginResult.merchants && loginResult.merchants.length > 0) {
      console.log(`\nMerchants found: ${loginResult.merchants.length}`);
      loginResult.merchants.forEach((m, i) => {
        console.log(`  ${i + 1}. ${m.merchantName} (${m.id})`);
        console.log(`     Outlet: ${m.outletName}`);
        console.log(`     QRIS: ${m.qrString ? 'Available' : 'Not available'}`);
      });
    }

    console.log();
    console.log('Session data structure:');
    console.log(JSON.stringify(loginResult.session, null, 2));

    console.log();
    console.log('Next steps:');
    console.log('1. Load this session when initializing GopayMerchant');
    console.log('2. Tokens will auto-refresh before expiry');
    console.log('3. Use onTokenRefreshed callback to update storage');

  } catch (error) {
    console.error('\nFatal error:', error);
    process.exit(1);
  }
}

main();
