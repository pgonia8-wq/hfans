import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Lock } from "lucide-react";
import { MiniKit } from "@worldcoin/minikit-js";
import { useInitiatePayment, useVerifyPayment } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { generateMockMiniKitPayload, formatWld } from "@/lib/utils";

interface PayButtonProps {
  type: "subscription" | "ppv" | "tip";
  amountWld: string;
  recipientId: string;
  contentId?: string;
  label?: string;
  onSuccess?: () => void;
  className?: string;
  variant?: "default" | "outline" | "glass" | "ghost" | "secondary";
  icon?: React.ReactNode;
}

export function PayButton({ type, amountWld, recipientId, contentId, label, onSuccess, className, variant = "default", icon }: PayButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const initiateMutation = useInitiatePayment();
  const verifyMutation = useVerifyPayment();
  const { toast } = useToast();

  const handlePayment = async () => {
    setIsProcessing(true);
    try {
      // 1. Initiate backend payment intent
      const initRes = await initiateMutation.mutateAsync({
        data: { type, amountWld, recipientId, contentId }
      });

      let verifyPayload;

      // 2. Call MiniKit
      if (MiniKit.isInstalled()) {
        const payload = {
          reference: initRes.referenceId,
          to: initRes.to,
          tokens: [{ symbol: "WLD", token_amount: initRes.amountWld }],
          description: initRes.description
        };
        
        const response = await MiniKit.commands.pay(payload);
        
        if (response.status !== "success") {
          throw new Error("Payment cancelled or failed in World App");
        }
        verifyPayload = response;
      } else {
        // Fallback for web testing
        console.log("[DEV] Mocking MiniKit Payment", initRes);
        await new Promise(r => setTimeout(r, 1000));
        verifyPayload = generateMockMiniKitPayload();
      }

      // 3. Verify payment backend
      const verifyRes = await verifyMutation.mutateAsync({
        data: {
          referenceId: initRes.referenceId,
          payload: verifyPayload
        }
      });

      if (verifyRes.success) {
        toast({ title: "Payment Successful", description: "Your transaction has been verified." });
        onSuccess?.();
      } else {
        throw new Error("Payment verification failed");
      }

    } catch (error: any) {
      console.error(error);
      toast({
        title: "Payment Failed",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Button 
      variant={variant} 
      className={className} 
      onClick={handlePayment} 
      disabled={isProcessing}
    >
      {isProcessing ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        icon || (type === 'ppv' ? <Lock className="w-4 h-4 mr-2" /> : null)
      )}
      {label || `Pay ${formatWld(amountWld)}`}
    </Button>
  );
}
