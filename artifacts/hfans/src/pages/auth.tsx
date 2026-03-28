import { useState } from "react";
import { MiniKit } from "@worldcoin/minikit-js";
import { useWalletAuth } from "@workspace/api-client-react";
import { useAuthStore } from "@/store/use-auth-store";
import { Button } from "@/components/ui/button";
import { Loader2, Fingerprint, ShieldCheck, Coins, Lock } from "lucide-react";
import { motion } from "framer-motion";

export function AuthScreen() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const walletAuthMutation = useWalletAuth();
  const { setUser } = useAuthStore();

  const handleConnect = async () => {
    setIsAuthenticating(true);
    setError(null);
    try {
      // Always fetch a server-issued nonce for replay-protection
      const nonceRes = await fetch("/api/auth/nonce");
      const { nonce } = await nonceRes.json() as { nonce: string };

      let finalPayload: any;

      if (MiniKit.isInstalled()) {
        const { finalPayload: fp } = await MiniKit.commandsAsync.walletAuth({
          nonce,
          requestId: "0",
          expirationTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          notBefore: new Date(Date.now() - 24 * 60 * 60 * 1000),
          statement: "Sign in to H Fans — the premier Web3 creator platform.",
        });

        if (fp.status !== "success") throw new Error("Wallet auth cancelled");
        finalPayload = fp;
      } else {
        // Dev fallback: simulate a SIWE payload structure
        await new Promise(r => setTimeout(r, 1200));
        const mockAddr = `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
        finalPayload = {
          status: "success",
          message: `hfans.app wants you to sign in with your Ethereum account:\n${mockAddr}\n\nSign in to H Fans\n\nURI: https://hfans.app\nVersion: 1\nChain ID: 480\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`,
          signature: "0x" + "a".repeat(130),
          address: mockAddr,
        };
      }

      const res = await walletAuthMutation.mutateAsync({
        data: { payload: finalPayload, nonce }
      });

      setUser((res as any).user);
    } catch (e: any) {
      console.error("Auth error", e);
      setError(e?.message || "Authentication failed. Please try again.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center relative overflow-hidden bg-black text-white">
      <img
        src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
        alt=""
        className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/30" />

      <div className="z-10 w-full max-w-sm px-6 flex flex-col items-center text-center">
        <motion.img
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          src={`${import.meta.env.BASE_URL}images/logo.png`}
          alt="H Fans Logo"
          className="w-24 h-24 mb-6 drop-shadow-[0_0_30px_rgba(0,102,255,0.7)]"
        />

        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-4xl font-display font-bold mb-2 tracking-tight"
        >
          H <span className="text-primary">Fans</span>
        </motion.h1>

        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-white/60 mb-8 text-sm leading-relaxed"
        >
          Premium exclusive content.<br />
          Zero platform boundaries.
        </motion.p>

        {/* Feature Pills */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex gap-2 mb-10 flex-wrap justify-center"
        >
          {[
            { icon: ShieldCheck, label: "World ID verified" },
            { icon: Coins, label: "Pay with WLD" },
            { icon: Lock, label: "Private & secure" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 bg-white/8 rounded-full px-3 py-1.5 text-xs text-white/70 border border-white/10">
              <Icon className="w-3.5 h-3.5 text-primary" />
              {label}
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="w-full space-y-3"
        >
          <Button
            size="lg"
            className="w-full rounded-2xl bg-white text-black hover:bg-white/90 hover:scale-[1.02] shadow-xl shadow-white/10 h-14 transition-all duration-200"
            onClick={handleConnect}
            disabled={isAuthenticating}
          >
            {isAuthenticating ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin text-black" />
            ) : (
              <Fingerprint className="w-5 h-5 mr-2 text-black" />
            )}
            <span className="font-semibold text-lg">
              {isAuthenticating ? "Connecting..." : "Connect with World App"}
            </span>
          </Button>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-400 text-sm bg-red-500/10 rounded-xl px-4 py-2 border border-red-500/20"
            >
              {error}
            </motion.p>
          )}

          <p className="text-xs text-white/35 leading-relaxed px-4">
            By connecting you confirm you are 18+ and agree to our{" "}
            <span className="text-white/60 underline">Terms of Service</span>.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
