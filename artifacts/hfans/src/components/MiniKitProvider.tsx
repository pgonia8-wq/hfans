import { useEffect, useState } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';

export function MiniKitProvider({ children }: { children: React.ReactNode }) {
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check and initialize MiniKit when running in World App
    MiniKit.install();
    
    // Slight delay to allow injection
    const timer = setTimeout(() => {
      setIsInstalled(MiniKit.isInstalled());
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  return <>{children}</>;
}
