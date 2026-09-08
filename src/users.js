import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';

const ROLES = ['user', 'admin'];
const STATUSES = ['active', 'deleted'];
const SALT_ROUNDS = 10;

const USER_COLUMNS = `user_id, user_created_date, name, email, password, role,
  user_status, user_update_date, plain_password`;

const TEST_USERS = [
  {
    name: 'Admin Test',
    email: 'admintest01@gmail.com',
    password: 'admintest01',
    role: 'admin',
  },
  {
    name: 'User Test',
    email: 'usertest01@gmail.com',
    password: 'usertest01',
    role: 'user',
  },
];

const CREATE_USERS_SQL = `
CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  user_created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  user_status TEXT NOT NULL DEFAULT 'active' CHECK (user_status IN ('active', 'deleted')),
  user_update_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  plain_password TEXT
);

CREATE UNIQUE INDEX users_email_lower_key ON users (LOWER(email));
`;

function isoDate(value) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

export function jwtSecret() {
  return process.env.JWT_SECRET || 'myland-admin-dev-secret';
}

export function publicUser(row, { includePlainPassword = false } = {}) {
  if (!row) return null;
  const user = {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    userStatus: row.user_status,
    createdDate: isoDate(row.user_created_date),
    updateDate: isoDate(row.user_update_date),
  };
  if (includePlainPassword) user.plainPassword = row.plain_password || '';
  return user;
}

export function signToken(user) {
  return jwt.sign(
    { userId: user.userId, email: user.email, role: user.role },
    jwtSecret(),
    { expiresIn: '7d' }
  );
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeName(name) {
  return String(name || '').trim();
}

export function validateUserInput(body, { partial = false, requirePassword = !partial } = {}) {
  const name = body.name != null ? normalizeName(body.name) : undefined;
  const email = body.email != null ? normalizeEmail(body.email) : undefined;
  const password = body.password != null ? String(body.password) : undefined;
  const role = body.role != null ? String(body.role).trim() : undefined;
  const userStatus = body.userStatus != null ? String(body.userStatus).trim() : undefined;

  if (!partial || body.name != null) {
    if (!name || name.length < 2) return 'Please enter a name.';
  }
  if (!partial || body.email != null) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return 'Please enter a valid email address.';
    }
  }
  if (requirePassword || (partial && password != null && password !== '')) {
    if (!password || password.length < 8) {
      return 'Password must be at least 8 characters.';
    }
  }
  if (role != null && !ROLES.includes(role)) return 'Role must be user or admin.';
  if (userStatus != null && !STATUSES.includes(userStatus)) {
    return 'Status must be active or deleted.';
  }
  return null;
}

async function tableExists() {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'`
  );
  return rows.length > 0;
}

async function currentColumns() {
  const { rows } = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'`
  );
  return new Set(rows.map((row) => row.column_name));
}

function schemaMatches(columns) {
  const required = [
    'user_id',
    'user_created_date',
    'name',
    'email',
    'password',
    'role',
    'user_status',
    'user_update_date',
    'plain_password',
  ];
  return required.every((column) => columns.has(column)) && !columns.has('password_hash');
}

export async function migrateUsersSchema() {
  const exists = await tableExists();
  const columns = exists ? await currentColumns() : new Set();
  if (exists && schemaMatches(columns)) return { recreated: false };

  await pool.query('DROP TABLE IF EXISTS users CASCADE');
  await pool.query(CREATE_USERS_SQL);
  console.log('users table recreated for admin auth');
  return { recreated: true };
}

export async function seedTestUsers() {
  for (const account of TEST_USERS) {
    const existing = await findUserByEmail(account.email);
    if (existing) continue;
    await createUser(account, { allowRole: true });
  }
}

export async function findUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE LOWER(email) = $1 LIMIT 1`,
    [normalizeEmail(email)]
  );
  return rows[0] || null;
}

export async function findUserById(userId) {
  const { rows } = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

export async function findActiveUserById(userId) {
  const row = await findUserById(userId);
  if (!row || row.user_status !== 'active') return null;
  return row;
}

export async function listUsers({ status } = {}) {
  const params = [];
  const where = [];
  if (status && STATUSES.includes(status)) {
    params.push(status);
    where.push(`user_status = $${params.length}`);
  }
  const { rows } = await pool.query(
    `SELECT ${USER_COLUMNS}
       FROM users
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY user_created_date DESC, user_id DESC`,
    params
  );
  return rows.map((row) => publicUser(row, { includePlainPassword: true }));
}

export async function listAdmins() {
  const { rows } = await pool.query(
    `SELECT user_id, name, email
       FROM users
      WHERE role = 'admin' AND user_status = 'active'
      ORDER BY name ASC, user_id ASC`
  );
  return rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email,
  }));
}

export async function createUser(input, { allowRole = false } = {}) {
  const name = normalizeName(input.name);
  const email = normalizeEmail(input.email);
  const password = String(input.password || '');
  const role = allowRole && ROLES.includes(input.role) ? input.role : 'user';
  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (
         name, email, password, role, user_status, plain_password,
         user_created_date, user_update_date
       ) VALUES ($1, $2, $3, $4, 'active', $5, NOW(), NOW())
       RETURNING ${USER_COLUMNS}`,
      [name, email, hash, role, password]
    );
    return publicUser(rows[0], { includePlainPassword: true });
  } catch (err) {
    if (err?.code === '23505') {
      const conflict = new Error('An account with that email already exists.');
      conflict.statusCode = 409;
      throw conflict;
    }
    throw err;
  }
}

export async function updateUser(userId, input) {
  const current = await findUserById(userId);
  if (!current) return null;

  const name = input.name != null ? normalizeName(input.name) : current.name;
  const email = input.email != null ? normalizeEmail(input.email) : current.email;
  const role = ROLES.includes(input.role) ? input.role : current.role;
  const userStatus = STATUSES.includes(input.userStatus) ? input.userStatus : current.user_status;
  const nextPassword = input.password != null && String(input.password).trim() !== '';
  const passwordHash = nextPassword
    ? await bcrypt.hash(String(input.password), SALT_ROUNDS)
    : current.password;
  const plainPassword = nextPassword ? String(input.password) : current.plain_password;

  try {
    const { rows } = await pool.query(
      `UPDATE users
          SET name = $2,
              email = $3,
              password = $4,
              role = $5,
              user_status = $6,
              plain_password = $7,
              user_update_date = NOW()
        WHERE user_id = $1
        RETURNING ${USER_COLUMNS}`,
      [userId, name, email, passwordHash, role, userStatus, plainPassword]
    );
    return publicUser(rows[0], { includePlainPassword: true });
  } catch (err) {
    if (err?.code === '23505') {
      const conflict = new Error('An account with that email already exists.');
      conflict.statusCode = 409;
      throw conflict;
    }
    throw err;
  }
}

export async function softDeleteUser(userId) {
  const { rows } = await pool.query(
    `UPDATE users
        SET user_status = 'deleted',
            user_update_date = NOW()
      WHERE user_id = $1
      RETURNING ${USER_COLUMNS}`,
    [userId]
  );
  return rows[0] ? publicUser(rows[0], { includePlainPassword: true }) : null;
}

export async function authenticateUser(email, password) {
  const row = await findUserByEmail(email);
  if (!row) return { error: 'Invalid email or password.' };
  if (row.user_status === 'deleted') {
    return { error: 'This account is no longer active.' };
  }
  const ok = await bcrypt.compare(String(password || ''), row.password);
  if (!ok) return { error: 'Invalid email or password.' };
  const user = publicUser(row);
  return { user, token: signToken(user) };
}
