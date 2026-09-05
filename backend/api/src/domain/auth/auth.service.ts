import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';
import { query } from '../../db/pool.js';
import { ApiError } from '../../lib/errors.js';
import type { Channel } from '../products/product.mapper.js';

const BCRYPT_ROUNDS = 12;

export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  accountType: Channel;
  businessName: string | null;
  iceNumber: string | null;
}

interface UserRow {
  id: string;
  email: string;
  phone: string | null;
  password_hash: string;
  full_name: string | null;
  account_type: Channel;
  business_name: string | null;
  ice_number: string | null;
  is_active: boolean;
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    accountType: row.account_type,
    businessName: row.business_name,
    iceNumber: row.ice_number,
  };
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName?: string | undefined;
  phone?: string | undefined;
  accountType: Channel;
  businessName?: string | undefined;
  iceNumber?: string | undefined;
}

export async function register(input: RegisterInput): Promise<{ user: AuthUser; token: string }> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  // An account is scoped to one app: the same address can hold both a
  // wholesale and a retail account without them colliding.
  const existing = await query<{ id: string }>(
    'SELECT id FROM commerce.users WHERE lower(email) = $1 AND account_type = $2',
    [email, input.accountType],
  );
  if (existing.rows.length > 0) {
    throw ApiError.conflict('An account with this email already exists for this app');
  }

  const { rows } = await query<UserRow>(
    `INSERT INTO commerce.users
       (email, password_hash, full_name, phone, account_type, business_name, ice_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, email, phone, password_hash, full_name, account_type,
               business_name, ice_number, is_active`,
    [
      email,
      passwordHash,
      input.fullName ?? null,
      input.phone ?? null,
      input.accountType,
      input.businessName ?? null,
      input.iceNumber ?? null,
    ],
  );

  const user = toAuthUser(rows[0]!);
  return { user, token: issueToken(user) };
}

export async function login(
  email: string,
  password: string,
  accountType: Channel,
): Promise<{ user: AuthUser; token: string }> {
  const { rows } = await query<UserRow>(
    `SELECT id, email, phone, password_hash, full_name, account_type,
            business_name, ice_number, is_active
       FROM commerce.users
      WHERE lower(email) = $1 AND account_type = $2`,
    [email.trim().toLowerCase(), accountType],
  );

  const row = rows[0];
  // Hash a throwaway value when the user is missing so the response time does
  // not reveal whether the address is registered.
  const hash = row?.password_hash ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const passwordMatches = await bcrypt.compare(password, hash);

  if (!row || !passwordMatches) {
    throw ApiError.unauthorized('Incorrect email or password');
  }
  if (!row.is_active) {
    throw ApiError.forbidden('This account has been deactivated');
  }

  const user = toAuthUser(row);
  return { user, token: issueToken(user) };
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const { rows } = await query<UserRow>(
    `SELECT id, email, phone, password_hash, full_name, account_type,
            business_name, ice_number, is_active
       FROM commerce.users
      WHERE id = $1 AND is_active = TRUE`,
    [id],
  );
  return rows[0] ? toAuthUser(rows[0]) : null;
}

export interface UpdateProfileInput {
  fullName?: string | undefined;
  phone?: string | undefined;
  businessName?: string | undefined;
  iceNumber?: string | undefined;
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<AuthUser> {
  const { rows } = await query<UserRow>(
    `UPDATE commerce.users
        SET full_name     = COALESCE($2, full_name),
            phone         = COALESCE($3, phone),
            business_name = COALESCE($4, business_name),
            ice_number    = COALESCE($5, ice_number)
      WHERE id = $1
      RETURNING id, email, phone, password_hash, full_name, account_type,
                business_name, ice_number, is_active`,
    [userId, input.fullName ?? null, input.phone ?? null, input.businessName ?? null, input.iceNumber ?? null],
  );

  if (!rows[0]) throw ApiError.notFound('User not found');
  return toAuthUser(rows[0]);
}

interface TokenPayload {
  sub: string;
  email: string;
  accountType: Channel;
}

export function issueToken(user: AuthUser): string {
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    accountType: user.accountType,
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === 'string' || !decoded.sub) {
      throw ApiError.unauthorized('Malformed token');
    }
    return decoded as unknown as TokenPayload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Session expired, please sign in again');
    }
    throw ApiError.unauthorized('Invalid token');
  }
}
