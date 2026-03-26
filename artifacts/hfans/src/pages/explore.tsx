import { useState } from "react";
import { Link } from "wouter";
import { useSearchCreators } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Search, Loader2, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Explore() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useSearchCreators({ q: search || "top" }); // default search to get popular

  return (
    <AppLayout title="Explore">
      <div className="p-4 sticky top-0 z-10 bg-background/95 backdrop-blur-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search creators..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-secondary/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="px-4 pb-8">
        <h2 className="text-lg font-display font-semibold mb-4 text-foreground/90">
          {search ? "Search Results" : "Trending Creators"}
        </h2>
        
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {data?.creators?.map(creator => (
              <Link key={creator.id} href={`/creator/${creator.username}`}>
                <div className="bg-card rounded-2xl overflow-hidden border border-white/5 hover:border-primary/30 transition-all duration-300 group cursor-pointer">
                  {/* Banner */}
                  <div className="h-20 w-full relative bg-secondary">
                    <img 
                      src={creator.bannerUrl || `${import.meta.env.BASE_URL}images/default-banner.png`} 
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
                  </div>
                  
                  {/* Info */}
                  <div className="px-3 pb-4 relative">
                    <div className="w-14 h-14 rounded-full border-2 border-card absolute -top-7 left-3 overflow-hidden bg-background">
                      <img 
                        src={creator.avatarUrl || `${import.meta.env.BASE_URL}images/default-avatar.png`} 
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    
                    <div className="pt-8 flex flex-col">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-sm truncate">{creator.displayName}</span>
                        {creator.isVerified && <span className="text-primary text-[10px]">✓</span>}
                      </div>
                      <span className="text-xs text-muted-foreground truncate mb-2">@{creator.username}</span>
                      
                      <Button size="sm" variant="outline" className="w-full h-8 text-xs rounded-lg border-primary/20 text-primary hover:bg-primary hover:text-white">
                        {creator.subscriptionPriceWld === "0" ? "Free" : `${creator.subscriptionPriceWld} WLD`}
                      </Button>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
