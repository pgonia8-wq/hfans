import { Router } from "express";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth.js";
import { hashMessage, recoverAddress } from "viem";

const router = Router();

const PLATFORM_APP_ID = process.env.WORLD_APP_ID || "";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

// In-memory nonce store: nonce -> expiresAt timestamp
const pendingNonces = new Map<string, number>();

// Clean up expired nonces periodically
setInterval(() => {
  const now = Date.now();
  for (const [nonce, exp] of pendingNonces) {
    if (exp < now) pendingNonces.delete(nonce);
  }
}, 60_000);

// ─── GET /auth/nonce ─────────────────────────────────────────────────────────
// Returns a one-time nonce to embed in the SIWE message
router.get("/nonce", (req, res) => {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  pendingNonces.set(nonce, Date.now() + 5 * 60 * 1000); // 5-min TTL
  res.json({ nonce });
});

// ─── POST /auth/wallet ───────────────────────────────────────────────────────
// MiniKit walletAuth final payload verification (SIWE)
router.post("/wallet", async (req, res) => {
  try {
    const { payload, nonce } = req.body;

    if (!payload || !nonce) {
      res.status(400).json({ error: "Missing payload or nonce" });
      return;
    }

    const { status, message, signature, address } = payload as {
      status: string;
      message: string;
      signature: string;
      address: string;
    };

    if (status !== "success" || !message || !signature || !address) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    // Validate nonce from in-memory store
    const nonceExpiry = pendingNonces.get(nonce);
    if (!nonceExpiry || nonceExpiry < Date.now()) {
      res.status(400).json({ error: "Invalid or expired nonce" });
      return;
    }

    // Verify nonce appears in the SIWE message
    if (!message.includes(nonce)) {
      res.status(400).json({ error: "Nonce mismatch in SIWE message" });
      return;
    }

    // Verify SIWE signature using viem
    let signerAddress: string;
    try {
      const msgHash = hashMessage(message);
      signerAddress = await recoverAddress({
        hash: msgHash,
        signature: signature as `0x${string}`,
      });
    } catch {
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    if (signerAddress.toLowerCase() !== address.toLowerCase()) {
      res.status(401).json({ error: "Signature address mismatch" });
      return;
    }

    // Consume nonce
    pendingNonces.delete(nonce);

    const walletAddress = address.toLowerCase();

    // Find or create user
    let [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.walletAddress, walletAddress))
      .limit(1);

    let isNew = false;
    if (!user) {
      const short = walletAddress.slice(2, 10);
      const [created] = await db
        .insert(usersTable)
        .values({
          username: `user_${short}`,
          displayName: `User ${short.slice(0, 6)}`,
          walletAddress,
          role: "fan",
        })
        .returning();
      user = created;
      isNew = true;
    }

    // Create session
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const [session] = await db
      .insert(sessionsTable)
      .values({ userId: user.id, expiresAt })
      .returning();

    res.cookie("sessionId", session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      expires: expiresAt,
      path: "/",
    });

    res.json({
      user: serializeUser(user),
      isNew,
    });
  } catch (err) {
    req.log.error({ err }, "Wallet auth error");
    res.status(500).json({ error: "Authentication failed" });
  }
});

// ─── POST /auth/world-id/verify ──────────────────────────────────────────────
// Verify a World ID ZK proof and mark user as verified
router.post("/world-id/verify", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { payload, action, signal } = req.body;

    if (!payload || !action) {
      res.status(400).json({ error: "Missing payload or action" });
      return;
    }

    if (!PLATFORM_APP_ID) {
      req.log.warn("WORLD_APP_ID not set, skipping on-chain verify");
      // Dev bypass: mark as verified anyway
      await db.update(usersTable).set({
        isWorldIdVerified: true,
        worldIdCredentialType: payload.verification_level || "orb",
        updatedAt: new Date(),
      }).where(eq(usersTable.id, user.id));
      res.json({ verified: true, credentialType: payload.verification_level });
      return;
    }

    const verifyRes = await fetch(
      `https://developer.worldcoin.org/api/v1/verify/${PLATFORM_APP_ID}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nullifier_hash: payload.nullifier_hash,
          merkle_root: payload.merkle_root,
          proof: payload.proof,
          verification_level: payload.verification_level,
          action,
          signal: signal || user.id,
        }),
      }
    );

    const data = await verifyRes.json() as {
      verified?: boolean;
      nullifier_hash?: string;
      credential_type?: string;
      detail?: string;
    };

    if (!verifyRes.ok) {
      res.status(400).json({ verified: false, error: data.detail || "Verification failed" });
      return;
    }

    await db.update(usersTable).set({
      isWorldIdVerified: true,
      nullifierHash: data.nullifier_hash,
      worldIdCredentialType: data.credential_type || payload.verification_level,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, user.id));

    res.json({
      verified: true,
      nullifierHash: data.nullifier_hash,
      credentialType: data.credential_type,
    });
  } catch (err) {
    req.log.error({ err }, "World ID verify error");
    res.status(500).json({ error: "Verification failed" });
  }
});

// ─── GET /auth/me ────────────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req, res) => {
  const user = getUser(req)!;
  res.json(serializeUser(user));
});

// ─── POST /auth/logout ───────────────────────────────────────────────────────
router.post("/logout", requireAuth, async (req, res) => {
  const sessionId = (req as any).sessionId;
  await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
  res.clearCookie("sessionId");
  res.json({ success: true });
});

function serializeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    walletAddress: user.walletAddress,
    role: user.role,
    isWorldIdVerified: user.isWorldIdVerified,
    worldIdCredentialType: user.worldIdCredentialType,
    createdAt: user.createdAt,
  };
}

export default router;
