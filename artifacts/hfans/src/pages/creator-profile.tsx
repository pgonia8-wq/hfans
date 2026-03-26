import { useRoute } from "wouter";
import { useGetUserProfile, useGetPosts } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PostCard } from "@/components/feed/PostCard";
import { PayButton } from "@/components/payment/PayButton";
import { Button } from "@/components/ui/button";
import { formatWld } from "@/lib/utils";
import { Loader2, ArrowLeft, Image as ImageIcon, Heart, Share2, MoreHorizontal } from "lucide-react";
import { motion } from "framer-motion";

export default function CreatorProfile() {
  const [, params] = useRoute("/creator/:username");
  const username = params?.username || "";
  
  const { data: profile, isLoading: isProfileLoading } = useGetUserProfile(username, {
    query: { enabled: !!username }
  });
  
  const { data: postsData, isLoading: isPostsLoading } = useGetPosts({ creatorId: profile?.id }, {
    query: { enabled: !!profile?.id }
  });

  if (isProfileLoading) {
    return (
      <AppLayout hideTopBar>
        <div className="h-[100dvh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout backButton title="Profile Not Found">
        <div className="p-12 text-center text-muted-foreground">User not found</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout hideTopBar>
      {/* Header / Banner */}
      <div className="relative w-full h-48 sm:h-56 bg-secondary">
        <img 
          src={profile.bannerUrl || `${import.meta.env.BASE_URL}images/default-banner.png`} 
          alt="Banner" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-background/90" />
        
        {/* Floating Top Nav */}
        <div className="absolute top-0 left-0 w-full flex justify-between items-center p-4 safe-area-pt">
          <button onClick={() => window.history.back()} className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex gap-2">
            <button className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10">
              <Share2 className="w-4 h-4" />
            </button>
            <button className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 relative bg-background">
        {/* Avatar */}
        <div className="absolute -top-12 left-4 w-24 h-24 rounded-full border-4 border-background overflow-hidden bg-card">
          <img 
            src={profile.avatarUrl || `${import.meta.env.BASE_URL}images/default-avatar.png`} 
            alt="Avatar" 
            className="w-full h-full object-cover"
          />
        </div>

        {/* Profile Info */}
        <div className="pt-14 pb-6 border-b border-white/5">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-display font-bold flex items-center gap-1.5">
                {profile.displayName}
                {profile.isVerified && <span className="text-primary text-sm">✓</span>}
              </h1>
              <p className="text-muted-foreground text-sm">@{profile.username}</p>
            </div>
          </div>
          
          <div className="flex gap-4 text-sm text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <ImageIcon className="w-4 h-4" /> <span className="font-medium text-foreground">{profile.postCount || 0}</span> Posts
            </div>
            <div className="flex items-center gap-1">
              <Heart className="w-4 h-4" /> <span className="font-medium text-foreground">{profile.likeCount || 0}</span> Likes
            </div>
          </div>

          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed mb-6">
            {profile.bio || "No bio yet."}
          </p>

          {/* Subscribe Action */}
          {!profile.isSubscribed && (
            <PayButton 
              type="subscription"
              amountWld={profile.subscriptionPriceWld || "0"}
              recipientId={profile.id}
              className="w-full h-12 rounded-xl text-base"
              label={`Subscribe for ${formatWld(profile.subscriptionPriceWld)} / month`}
            />
          )}
          {profile.isSubscribed && (
            <Button variant="outline" className="w-full h-12 text-primary border-primary/30" disabled>
              Subscribed
            </Button>
          )}
        </div>
      </div>

      {/* Posts Feed */}
      <div className="bg-card min-h-[50vh]">
        {isPostsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : postsData?.posts?.length ? (
          postsData.posts.map(post => (
            <PostCard key={post.id} post={post} />
          ))
        ) : (
          <div className="p-12 text-center text-muted-foreground">
            No posts yet
          </div>
        )}
      </div>
    </AppLayout>
  );
}
