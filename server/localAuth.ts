import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler, Request, Response, NextFunction } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

// ============================================
// JWT Configuration
// ============================================
const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-in-production";
const JWT_EXPIRES_IN = 7 * 24 * 60 * 60; // 7 days in seconds

interface JWTPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

/**
 * Generate a JWT token
 * Simple implementation without external library for minimal dependencies
 */
function generateToken(userId: string, email: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    userId,
    email,
    iat: now,
    exp: now + JWT_EXPIRES_IN,
  };

  const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${base64Header}.${base64Payload}`)
    .digest("base64url");

  return `${base64Header}.${base64Payload}.${signature}`;
}

/**
 * Verify and decode a JWT token
 */
function verifyToken(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [base64Header, base64Payload, signature] = parts;

    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${base64Header}.${base64Payload}`)
      .digest("base64url");

    if (signature !== expectedSignature) return null;

    // Decode payload
    const payload = JSON.parse(Buffer.from(base64Payload, "base64url").toString()) as JWTPayload;

    // Check expiration
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// Simple password hashing (for demo purposes - in production use bcrypt)
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      maxAge: sessionTtl,
    },
  });
}

export async function setupLocalAuth(app: Express) {
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Local strategy for username/password
  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      async (email, password, done) => {
        try {
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email));

          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }

          if (!user.password || !verifyPassword(password, user.password)) {
            return done(null, false, { message: "Invalid email or password" });
          }

          return done(null, {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          });
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Login endpoint - supports both session (web) and JWT (mobile)
  app.post("/api/login", (req, res, next) => {
    // Check if this is a mobile client request
    const isMobile =
      req.headers["x-client-type"] === "mobile" ||
      req.body.mobile === true;

    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        return res.status(500).json({ message: "Authentication error" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }

      if (isMobile) {
        // For mobile clients: Return JWT token (no session)
        const token = generateToken(user.id, user.email);
        return res.json({
          message: "Login successful",
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          },
          token,
        });
      }

      // For web clients: Create session
      req.logIn(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login error" });
        }
        return res.json({ message: "Login successful", user });
      });
    })(req, res, next);
  });

  // Logout endpoint - supports both GET (browser) and POST (API)
  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/login");
    });
  });

  app.post("/api/logout", (req, res) => {
    req.logout(() => {
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current user - supports both session and JWT
  app.get("/api/auth/user", async (req, res) => {
    // Check for JWT token first
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const payload = verifyToken(token);

      if (payload) {
        const user = await storage.getUser(payload.userId);
        if (user) {
          return res.json({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            profileImageUrl: user.profileImageUrl,
          });
        }
      }
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // Fall back to session auth
    if (req.isAuthenticated() && req.user) {
      res.json(req.user);
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  // Registration endpoint for mobile clients
  app.post("/api/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName, mobile } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Check if user already exists
      const [existingUser] = await db.select().from(users).where(eq(users.email, email));
      if (existingUser) {
        return res.status(409).json({ message: "User with this email already exists" });
      }

      // Create new user
      const userId = crypto.randomUUID();
      const hashedPassword = hashPassword(password);

      await db.insert(users).values({
        id: userId,
        email,
        password: hashedPassword,
        firstName: firstName || null,
        lastName: lastName || null,
      });

      const newUser = {
        id: userId,
        email,
        firstName: firstName || null,
        lastName: lastName || null,
      };

      // For mobile clients, return JWT
      if (mobile === true || req.headers["x-client-type"] === "mobile") {
        const token = generateToken(userId, email);
        return res.status(201).json({
          message: "Registration successful",
          user: newUser,
          token,
        });
      }

      // For web clients, create session and return user
      req.logIn(newUser, (err) => {
        if (err) {
          return res.status(500).json({ message: "Login error after registration" });
        }
        return res.status(201).json({
          message: "Registration successful",
          user: newUser,
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });
}

/**
 * Hybrid authentication middleware
 * Supports both session-based auth (web) and JWT auth (mobile)
 */
export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  // Check for JWT token first (mobile clients)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    if (payload) {
      const user = await storage.getUser(payload.userId);
      if (user) {
        // Attach user to request for route handlers
        req.user = {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
        };
        return next();
      }
    }
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  // Fall back to session auth (web clients)
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return next();
  }

  return res.status(401).json({ message: "Unauthorized" });
};

// Helper to hash passwords for seeding
export { hashPassword };
