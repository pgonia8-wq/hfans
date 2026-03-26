import { useState } from "react";
import { MiniKit } from "@worldcoin/minikit-js";
import { useWalletAuth } from "@workspace/api-client-react";
import { useAuthStore } from "@/store/use-auth-store";
import { Button } from "@/components/ui/button";
import { Loader2, Fingerprint } from "lucide-react";
import { generateMockMiniKitPayload } from "@/lib/utils";
import { motion } from "framer-motion";

export function AuthScreen() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const walletAuthMutation = useWalletAuth();
  const { setUser } = useAuthStore();

  const handleConnect = async () => {
    setIsAuthenticating(true);
    try {
      let payload;
      let address;
      
      if (MiniKit.isInstalled()) {
        const nonce = crypto.randomUUID();
        const response = await MiniKit.commands.walletAuth({
          nonce,
          requestId: 'hfans_login',
          expirationTime: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000),
          notBefore: new Date(new Date().getTime() - 24 * 60 * 60 * 1000),
          statement: 'Sign in to H Fans adult creator platform.',
        });
        
        if (response.status !== "success") throw new Error("Wallet auth failed");
        payload = response;
        address = response.address || "0xMiniKitAuthedUser"; // Actual extraction depends on minikit typing
      } else {
        // Dev fallback
        await new Promise(r => setTimeout(r, 1500));
        payload = generateMockMiniKitPayload();
        address = `0xDevMockUser${Math.floor(Math.random()*10000)}`;
      }

      const res = await walletAuthMutation.mutateAsync({
        data: {
          payload,
          nonce: "dev_nonce",
          address
        }
      });

      setUser(res.user);
      
    } catch (e) {
      console.error(e);
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center relative overflow-hidden bg-black text-white">
      {/* Background Graphic */}
      <img 
        src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
        alt="Background" 
        className="absolute inset-0 w-full h-full object-cover opacity-50"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
      
      <div className="z-10 w-full max-w-sm px-6 flex flex-col items-center text-center">
        <motion.img 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          src={`${import.meta.env.BASE_URL}images/logo.png`} 
          alt="H Fans Logo" 
          className="w-24 h-24 mb-6 drop-shadow-[0_0_20px_rgba(0,102,255,0.6)]"
        />
        
        <motion.h1 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-4xl font-display font-bold mb-3 tracking-tight"
        >
          H <span className="text-primary">Fans</span>
        </motion.h1>
        
        <motion.p 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-white/60 mb-12"
        >
          Premium exclusive content. <br/> Zero platform boundaries.
        </motion.p>
        
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="w-full"
        >
          <Button 
            size="lg" 
            className="w-full rounded-2xl bg-white text-black hover:bg-white/90 hover:scale-[1.02] shadow-xl shadow-white/10 h-14"
            onClick={handleConnect}
            disabled={isAuthenticating}
          >
            {isAuthenticating ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin text-black" />
            ) : (
              <Fingerprint className="w-5 h-5 mr-2 text-black" />
            )}
            <span className="font-semibold text-lg">Connect with World App</span>
          </Button>
          <p className="mt-6 text-xs text-white/40 max-w-xs mx-auto">
            By connecting, you confirm you are 18+ and agree to our Terms of Service.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
