import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthProvider } from '@repo/db';
import { AppModule } from '../../src/app.module';
import {
  cleanTestDatabase,
  getTestPrismaClient,
  setupTestDatabase,
  teardownTestDatabase,
} from '../helpers/db-test-harness';

jest.unmock('@repo/db');

describe('Auth & Workspace Engine (e2e)', () => {
  let app: INestApplication<App>;

  it('verifies AuthProvider enum runtime resolution in Jest', () => {
    expect(AuthProvider).toEqual({
      PASSWORD: 'PASSWORD',
      GOOGLE: 'GOOGLE',
    });
  });

  beforeAll(async () => {
    // 1. Validate TEST_DATABASE_URL safety & initialize test DB
    await setupTestDatabase();

    // 2. Instantiate NestJS application once for E2E suite lifetime
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    // Clean test database tables between individual test cases
    await cleanTestDatabase();
  });

  describe('CSRF Guard Safety & Custom Header Verification', () => {
    it('should reject state-changing POST requests missing custom CSRF header with 403 FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({
          email: 'nocsrf@example.com',
          password: 'Password123!',
        })
        .expect(403);

      expect(res.body).toHaveProperty('code', 'FORBIDDEN');
      expect(res.body.message).toContain('CSRF protection');
    });

    it('should allow state-changing POST requests with X-Requested-With header', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          email: 'withcsrf1@example.com',
          password: 'Password123!',
          name: 'CSRF User 1',
        });
      expect(res.status).toBe(201);

      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe('withcsrf1@example.com');
    });

    it('should allow state-changing POST requests with x-csrf-token header', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .set('x-csrf-token', 'custom-csrf-token-val')
        .send({
          email: 'withcsrf2@example.com',
          password: 'Password123!',
          name: 'CSRF User 2',
        })
        .expect(201);

      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe('withcsrf2@example.com');
    });

    it('should explicitly exempt OAuth callback from custom header requirements', async () => {
      // Callback without X-Requested-With should not trigger 403 CSRF header guard error
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/google/callback')
        .expect(400); // 400 VALIDATION_ERROR due to missing state/code, NOT 403 CSRF

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.message).toContain('state');
    });
  });

  describe('AUTH-001 & AUTH-002: Password Provisioning & Auth Invariants', () => {
    it('should atomically provision User + AuthIdentity + Workspace + WorkspaceMember(OWNER) on first signup', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          email: 'alice@example.com',
          password: 'Password123!',
          name: 'Alice Cooper',
        })
        .expect(201);

      expect(res.body.user).toEqual({
        id: expect.any(String),
        email: 'alice@example.com',
        name: 'Alice Cooper',
      });
      expect(res.body.workspace).toEqual({
        id: expect.any(String),
        name: "Alice Cooper's Workspace",
      });

      // Verify session cookie
      const cookies = res.get('Set-Cookie') || [];
      const sessionCookie = cookies.find((c: string) =>
        c.startsWith('career_os_session='),
      );
      expect(sessionCookie).toBeDefined();

      // Verify database records
      const prisma = getTestPrismaClient();
      const user = await prisma.user.findUnique({
        where: { email: 'alice@example.com' },
      });
      expect(user).toBeDefined();

      const identity = await prisma.authIdentity.findFirst({
        where: { userId: user!.id, provider: 'PASSWORD' },
      });
      expect(identity).toBeDefined();
      expect(identity!.passwordHash).not.toBe('Password123!');

      const member = await prisma.workspaceMember.findFirst({
        where: { userId: user!.id },
        include: { workspace: true },
      });
      expect(member).toBeDefined();
      expect(member!.role).toBe('OWNER');
      expect(member!.userId).toBe(user!.id);
    });

    it('should resolve existing user and workspace on login without creating duplicate workspaces', async () => {
      const signupRes = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          email: 'bob@example.com',
          password: 'Password123!',
        })
        .expect(201);

      const createdWorkspaceId = signupRes.body.workspace.id;

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          email: 'bob@example.com',
          password: 'Password123!',
        })
        .expect(200);

      expect(loginRes.body.workspace.id).toBe(createdWorkspaceId);

      // Verify no duplicate workspaces were created in database
      const prisma = getTestPrismaClient();
      const members = await prisma.workspaceMember.findMany({
        where: { userId: loginRes.body.user.id },
      });
      expect(members.length).toBe(1);
    });

    it('should reject signup for duplicate email with 409 CONFLICT', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          email: 'charlie@example.com',
          password: 'Password123!',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          email: 'charlie@example.com',
          password: 'DifferentPassword123!',
        })
        .expect(409);

      expect(res.body).toHaveProperty('code', 'CONFLICT');
    });

    it('should handle concurrent duplicate signup attempts by failing closed with 409 CONFLICT', async () => {
      const payload = {
        email: 'concurrent@example.com',
        password: 'Password123!',
      };

      const results = await Promise.allSettled([
        request(app.getHttpServer())
          .post('/api/v1/auth/signup')
          .set('X-Requested-With', 'XMLHttpRequest')
          .send(payload),
        request(app.getHttpServer())
          .post('/api/v1/auth/signup')
          .set('X-Requested-With', 'XMLHttpRequest')
          .send(payload),
      ]);

      const statuses = results
        .filter(
          (r): r is PromiseFulfilledResult<request.Response> =>
            r.status === 'fulfilled',
        )
        .map((r) => r.value.status);

      expect(statuses).toContain(201);
      expect(statuses).toContain(409);
    });
  });

  describe('AUTH-004 & AUTH-005: Stateless Cookie Logout & Session Resolution', () => {
    it('GET /api/v1/auth/me should return 401 UNAUTHORIZED when unauthenticated', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);

      expect(res.body).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('GET /api/v1/auth/me and GET /api/v1/workspaces/current should return identity & workspace when session cookie present', async () => {
      const signupRes = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          email: 'dave@example.com',
          password: 'Password123!',
          name: 'Dave Smith',
        })
        .expect(201);

      const cookies = signupRes.get('Set-Cookie') || [];
      const sessionCookie = cookies.find((c: string) =>
        c.startsWith('career_os_session='),
      );

      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie!)
        .expect(200);

      expect(meRes.body.user.email).toBe('dave@example.com');
      expect(meRes.body.workspace.name).toBe("Dave Smith's Workspace");
      expect(meRes.body.workspace.ownerId).toBe(signupRes.body.user.id);
      expect(meRes.body.workspace.ownerId).not.toBe(meRes.body.workspace.id);

      const wsRes = await request(app.getHttpServer())
        .get('/api/v1/workspaces/current')
        .set('Cookie', sessionCookie!)
        .expect(200);

      expect(wsRes.body.id).toBe(meRes.body.workspace.id);
      expect(wsRes.body.name).toBe("Dave Smith's Workspace");
      expect(wsRes.body.ownerId).toBe(signupRes.body.user.id);
      expect(wsRes.body.ownerId).not.toBe(wsRes.body.id);
    });

    it('POST /api/v1/auth/logout should clear cookie and reflect stateless JWT semantics', async () => {
      // Step 1: Signup & receive session cookie
      const signupRes = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          email: 'stateless@example.com',
          password: 'Password123!',
        })
        .expect(201);

      const signupCookies = signupRes.get('Set-Cookie') || [];
      const rawCookieVal = signupCookies.find((c: string) =>
        c.startsWith('career_os_session='),
      );
      const tokenMatch = rawCookieVal?.match(/career_os_session=([^;]+)/);
      const bearerToken = tokenMatch ? tokenMatch[1] : '';

      // Step 2: Logout clears session cookie
      const logoutRes = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('X-Requested-With', 'XMLHttpRequest')
        .expect(200);

      expect(logoutRes.body).toEqual({ success: true });
      const logoutCookies = logoutRes.get('Set-Cookie') || [];
      const clearedCookie = logoutCookies.find((c: string) =>
        c.startsWith('career_os_session='),
      );
      expect(clearedCookie).toContain('Max-Age=0');

      // Step 3: Request with cleared cookie fails
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', 'career_os_session=')
        .expect(401);

      // Step 4: Verify stateless JWT contract: bearer token issued prior to logout remains cryptographically valid until expiration
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${bearerToken}`)
        .expect(200);

      expect(meRes.body.user.email).toBe('stateless@example.com');
    });
  });

  describe('AUTH-009: Google OIDC Provider Provisioning & Account Isolation', () => {
    it('GET /api/v1/auth/google should generate state cookie and 302 redirect', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/google')
        .expect(302);

      expect(res.headers.location).toContain(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      expect(res.headers.location).toContain('response_type=code');

      const cookies = res.get('Set-Cookie') || [];
      expect(
        cookies.some((c: string) => c.startsWith('career_os_oauth_state=')),
      ).toBe(true);
    });

    it('GET /api/v1/auth/google/callback should atomically provision Google user & workspace on first auth', async () => {
      // Step 1: Initiate auth to set state cookie
      const initRes = await request(app.getHttpServer())
        .get('/api/v1/auth/google')
        .expect(302);

      const cookies = initRes.get('Set-Cookie') || [];
      const stateCookie = cookies.find((c: string) =>
        c.startsWith('career_os_oauth_state='),
      );
      const locationUrl = new URL(initRes.headers.location);
      const stateParam = locationUrl.searchParams.get('state');

      // Step 2: Callback with mock code
      const callbackRes = await request(app.getHttpServer())
        .get(
          `/api/v1/auth/google/callback?code=mock_code_google_user_1&state=${stateParam}`,
        )
        .set('Cookie', stateCookie!)
        .expect(302);

      expect(callbackRes.headers.location).toBe('http://localhost:5173');

      // Verify session cookie set
      const callbackCookies = callbackRes.get('Set-Cookie') || [];
      const sessionCookie = callbackCookies.find((c: string) =>
        c.startsWith('career_os_session='),
      );
      expect(sessionCookie).toBeDefined();

      // Verify DB identity and zero token persistence
      const prisma = getTestPrismaClient();
      const identity = await prisma.authIdentity.findFirst({
        where: { provider: 'GOOGLE', providerUserId: 'google_user_1' },
        include: { user: true },
      });
      expect(identity).toBeDefined();
      expect(identity!.passwordHash).toBeNull();
      expect(identity!.email).toBe('google-google_user_1@example.com');
    });

    it('should resolve existing Google identity on repeat sign-in without creating duplicate workspaces', async () => {
      // First sign-in
      const init1 = await request(app.getHttpServer())
        .get('/api/v1/auth/google')
        .expect(302);
      const stateCookie1 = (init1.get('Set-Cookie') || []).find((c: string) =>
        c.startsWith('career_os_oauth_state='),
      );
      const stateParam1 = new URL(init1.headers.location).searchParams.get(
        'state',
      );

      await request(app.getHttpServer())
        .get(
          `/api/v1/auth/google/callback?code=mock_code_repeat_user&state=${stateParam1}`,
        )
        .set('Cookie', stateCookie1!)
        .expect(302);

      // Repeat sign-in
      const init2 = await request(app.getHttpServer())
        .get('/api/v1/auth/google')
        .expect(302);
      const stateCookie2 = (init2.get('Set-Cookie') || []).find((c: string) =>
        c.startsWith('career_os_oauth_state='),
      );
      const stateParam2 = new URL(init2.headers.location).searchParams.get(
        'state',
      );

      await request(app.getHttpServer())
        .get(
          `/api/v1/auth/google/callback?code=mock_code_repeat_user&state=${stateParam2}`,
        )
        .set('Cookie', stateCookie2!)
        .expect(302);

      // Verify single workspace created
      const prisma = getTestPrismaClient();
      const user = await prisma.user.findUnique({
        where: { email: 'google-repeat_user@example.com' },
      });
      const members = await prisma.workspaceMember.findMany({
        where: { userId: user!.id },
      });
      expect(members.length).toBe(1);
    });

    it('should reject Google authentication matching existing password account with 409 CONFLICT', async () => {
      // 1. Password signup for target email
      await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          email: 'google-existing_email@example.com',
          password: 'Password123!',
        })
        .expect(201);

      // 2. Google callback attempting to authenticate with same email
      const init = await request(app.getHttpServer())
        .get('/api/v1/auth/google')
        .expect(302);
      const stateCookie = (init.get('Set-Cookie') || []).find((c: string) =>
        c.startsWith('career_os_oauth_state='),
      );
      const stateParam = new URL(init.headers.location).searchParams.get(
        'state',
      );

      const callbackRes = await request(app.getHttpServer())
        .get(
          `/api/v1/auth/google/callback?code=mock_code_existing_email&state=${stateParam}`,
        )
        .set('Cookie', stateCookie!)
        .expect(409);

      expect(callbackRes.body.code).toBe('CONFLICT');
      expect(callbackRes.body.message).toContain(
        'Please log in with your password',
      );
    });

    it('should reject Google callback when state parameter is invalid or state cookie missing (CSRF/PKCE defense)', async () => {
      // 1. Missing state cookie
      const res1 = await request(app.getHttpServer())
        .get(
          '/api/v1/auth/google/callback?code=mock_code_bad_state&state=bogus_state',
        )
        .expect(400);

      expect(res1.body.code).toBe('VALIDATION_ERROR');

      // 2. Mismatched state parameter vs state cookie
      const init = await request(app.getHttpServer())
        .get('/api/v1/auth/google')
        .expect(302);
      const stateCookie = (init.get('Set-Cookie') || []).find((c: string) =>
        c.startsWith('career_os_oauth_state='),
      );

      const res2 = await request(app.getHttpServer())
        .get(
          '/api/v1/auth/google/callback?code=mock_code_bad_state&state=different_state_param',
        )
        .set('Cookie', stateCookie!)
        .expect(400);

      expect(res2.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject Google callback when authorization code parameter is missing', async () => {
      const init = await request(app.getHttpServer())
        .get('/api/v1/auth/google')
        .expect(302);
      const stateCookie = (init.get('Set-Cookie') || []).find((c: string) =>
        c.startsWith('career_os_oauth_state='),
      );
      const stateParam = new URL(init.headers.location).searchParams.get(
        'state',
      );

      const res = await request(app.getHttpServer())
        .get(`/api/v1/auth/google/callback?state=${stateParam}`)
        .set('Cookie', stateCookie!)
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('AUTH-007: Tenant Isolation & Authorization Boundary', () => {
    it('should reject access when user A attempts to request resources with workspaceId B', async () => {
      // Provision User A
      const userARes = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          email: 'usera@example.com',
          password: 'Password123!',
        })
        .expect(201);

      const userACookie = (userARes.get('Set-Cookie') || []).find((c: string) =>
        c.startsWith('career_os_session='),
      );

      // Provision User B
      const userBRes = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          email: 'userb@example.com',
          password: 'Password123!',
        })
        .expect(201);

      const workspaceBId = userBRes.body.workspace.id;

      // User A attempts to access endpoint passing User B's workspace ID header
      const res = await request(app.getHttpServer())
        .get('/api/v1/workspaces/current')
        .set('Cookie', userACookie!)
        .set('x-workspace-id', workspaceBId)
        .expect(403);

      expect(res.body).toHaveProperty('code', 'FORBIDDEN');
    });
  });
});
