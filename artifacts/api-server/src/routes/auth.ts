import { Router } from "express";
import { db, usersTable, sessionsTable, creatorProfilesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth.js";

const router = Router();

const PLATFORM_APP_ID = process.env.WORLD_APP_ID || "app_staging_placeholder";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Verify World ID proof
router.post("/world-id/verify", async (req, res) => {
  try {
    const { payload, action, signal } = req.body;
    if (!payload || !action) {
      res.status(400).json({ error: "Missing payload or action" });
      return;
    }

    // Verify with World ID API
    const verifyRes = await fetch(`https://developer.worldcoin.org/api/v1/verify/${PLATFORM_APP_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nullifier_hash: payload.nullifier_hash,
        merkle_root: payload.merkle_root,
        proof: payload.proof,
        verification_level: payload.verification_level,
        action,
        signal: signal || "",
      }),
    });

    const verifyData = await verifyRes.json() as { verified?: boolean; nullifier_hash?: string; credential_type?: string; detail?: string };

    if (!verifyRes.ok) {
      req.log.warn({ verifyData }, "World ID verification failed");
      res.status(400).json({ verified: false, error: verifyData.detail || "Verification failed" });
      return;
    }

    // Update user's World ID status if logged in
    const user = getUser(req);
    if (user) {
      await db
        .update(usersTable)
        .set({
          isWorldIdVerified: true,
          nullifierHash: verifyData.nullifier_hash,
          worldIdCredentialType: verifyData.credential_type || payload.verification_level,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, user.id));
    }

    res.json({
      verified: true,
      nullifierHash: verifyData.nullifier_hash,
      credentialType: verifyData.credential_type || payload.verification_level,
    });
  } catch (err) {
    req.log.error({ err }, "World ID verification error");
    res.status(500).json({ error: "Verification failed" });
  }
});

// Wallet auth - create or login user
router.post("/wallet", async (req, res) => {
  try {
    const { payload, nonce, address } = req.body;
    if (!payload || !nonce || !address) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // In production: verify SIWE message signature from MiniKit
    // payload contains the signed message from MiniKit.commands.walletAuth
    const walletAddress = address.toLowerCase();

    // Find or create user
    let [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.walletAddress, walletAddress))
      .limit(1);

    let isNew = false;
    if (!user) {
      // Generate username from address
      const username = `user_${walletAddress.slice(2, 10)}`;
      const [created] = await db
        .insert(usersTable)
        .values({
          username,
          displayName: `User ${walletAddress.slice(2, 8)}`,
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

    // Set cookie
    res.cookie("sessionId", session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      expires: expiresAt,
      path: "/",
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        bannerUrl: user.bannerUrl,
        walletAddress: user.walletAddress,
        role: user.role,
        isWorldIdVerified: user.isWorldIdVerified,
        createdAt: user.createdAt,
      },
      isNew,
    });
  } catch (err) {
    req.log.error({ err }, "Wallet auth error");
    res.status(500).json({ error: "Authentication failed" });
  }
});

// Get current user
router.get("/me", requireAuth, async (req, res) => {
  const user = getUser(req)!;
  res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    walletAddress: user.walletAddress,
    role: user.role,
    isWorldIdVerified: user.isWorldIdVerified,
    createdAt: user.createdAt,
  });
});

// Logout
router.post("/logout", requireAuth, async (req, res) => {
  const sessionId = (req as any).sessionId;
  await db.delete(sessionsTable).where(eq(sessionsTable.id, sessionId));
  res.clearCookie("sessionId");
  res.json({ success: true, message: "Logged out" });
});

export default router;
