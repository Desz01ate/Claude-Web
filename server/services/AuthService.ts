import * as crypto from 'crypto';
import type { ConfigStore } from './ConfigStore';

// Token payload
interface TokenPayload {
  iat: number;  // Issued at
  exp: number;  // Expiration
  salt: string; // Random salt for signature uniqueness
}

// Token expiration: 24 hours
const TOKEN_EXPIRATION_MS = 24 * 60 * 60 * 1000;

// Server secret for signing tokens (from env or auto-generated)
let serverSecret: string;

export class AuthService {
  private configStore: ConfigStore;

  constructor(configStore: ConfigStore) {
    this.configStore = configStore;
  }

  /**
   * Initialize the auth service with a secret
   */
  static initialize(): void {
    serverSecret = process.env.AUTH_SECRET || AuthService.generateSecret();
    console.log('[AuthService] Initialized with secret');
  }

  /**
   * Generate a random secret for token signing
   */
  private static generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Check if authentication is enabled (password is set)
   */
  isAuthEnabled(): boolean {
    return this.configStore.isPasswordSet();
  }

  /**
   * Check if the user is locked out
   */
  isLockedOut(): boolean {
    return this.configStore.isLockedOut();
  }

  /**
   * Verify a password and return a token if valid
   */
  async login(password: string): Promise<{ success: boolean; token?: string; error?: string }> {
    if (!this.isAuthEnabled()) {
      return { success: false, error: 'Authentication is not enabled' };
    }

    // Check if user is locked out
    if (this.configStore.isLockedOut()) {
      return {
        success: false,
        error: 'Account locked. Remove "lockedOut" from config.json to unlock.'
      };
    }

    const isValid = await this.configStore.verifyPassword(password);
    if (!isValid) {
      const isNowLocked = this.configStore.incrementFailedAttempts();
      const attempts = this.configStore.getFailedLoginAttempts();

      if (isNowLocked) {
        return {
          success: false,
          error: 'Account locked after 3 failed attempts. Remove "lockedOut" from config.json to unlock.'
        };
      }

      return {
        success: false,
        error: `Invalid password. ${3 - attempts} attempt(s) remaining before lockout.`
      };
    }

    // Reset failed attempts on successful login
    this.configStore.resetFailedAttempts();

    const token = this.generateToken();
    return { success: true, token };
  }

  /**
   * Verify a token's validity
   */
  verifyToken(token: string): boolean {
    if (!this.isAuthEnabled()) {
      // If auth is not enabled, any token is considered valid
      // or we could return true always
      return true;
    }

    try {
      const parts = token.split('.');
      if (parts.length !== 2) {
        return false;
      }

      const [payloadB64, signature] = parts;
      const expectedSignature = this.sign(payloadB64);

      // Constant-time comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  /**
   * Generate a signed token
   */
  private generateToken(): string {
    const now = Date.now();
    const payload: TokenPayload = {
      iat: now,
      exp: now + TOKEN_EXPIRATION_MS,
      salt: crypto.randomBytes(8).toString('hex'),
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.sign(payloadB64);

    return `${payloadB64}.${signature}`;
  }

  /**
   * Sign a payload using HMAC-SHA256
   */
  private sign(payload: string): string {
    return crypto
      .createHmac('sha256', serverSecret)
      .update(payload)
      .digest('base64url');
  }
}

// Initialize the service immediately
AuthService.initialize();
