import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatWld(amount?: string | number) {
  if (!amount) return "0 WLD";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `${num.toLocaleString("en-US", { maximumFractionDigits: 2 })} WLD`;
}

export function generateMockMiniKitPayload() {
  return {
    status: "success",
    payment_reference: `ref_${Math.random().toString(36).substr(2, 9)}`,
    transaction_id: `0x${Math.random().toString(36).substr(2, 40)}`,
  };
}
