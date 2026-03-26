import { useState } from "react";
import { Link } from "wouter";
import { Post, useLikePost, useBookmarkPost } from "@workspace/api-client-react";
import { Heart, MessageCircle, Share2, Bookmark, MoreVertical, ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PayButton } from "@/components/payment/PayButton";
import { cn, formatWld } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export function PostCard({ post }: { post: Post }) {
  const queryClient = useQueryClient();
  const likeMutation = useLikePost();
  const bookmarkMutation = useBookmarkPost();
  const [optimisticLike, setOptimisticLike] = useState(post.isLiked);
  const [optimisticLikeCount, setOptimisticLikeCount] = useState(post.likeCount || 0);

  const isLocked = post.isPpv && !post.isUnlocked;

  const handleLike = async () => {
    setOptimisticLike(!optimisticLike);
    setOptimisticLikeCount(prev => optimisticLike ? prev - 1 : prev + 1);
    try {
      await likeMutation.mutateAsync({ postId: post.id });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
    } catch (e) {
      // Revert on error
      setOptimisticLike(post.isLiked);
      setOptimisticLikeCount(post.likeCount || 0);
    }
  };

  const handleBookmark = async () => {
    try {
      await bookmarkMutation.mutateAsync({ postId: post.id });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/bookmarks"] });
    } catch (e) {}
  };

  return (
    <div className="border-b border-white/5 bg-background">
      {/* Header */}
      <div className="flex justify-between items-center p-4">
        <Link href={`/creator/${post.creator?.username}`} className="flex items-center gap-3">
          <img 
            src={post.creator?.avatarUrl || `${import.meta.env.BASE_URL}images/default-avatar.png`} 
            alt={post.creator?.displayName} 
            className="w-10 h-10 rounded-full object-cover border border-white/10"
          />
          <div>
            <div className="flex items-center gap-1">
              <span className="font-semibold text-foreground">{post.creator?.displayName}</span>
              {post.creator?.isVerified && <span className="text-primary text-xs">✓</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              @{post.creator?.username} • {formatDistanceToNow(new Date(post.createdAt))} ago
            </div>
          </div>
        </Link>
        <button className="text-muted-foreground hover:text-foreground p-1">
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      {/* Text Content */}
      {post.text && (
        <div className="px-4 pb-3 text-sm text-foreground/90 whitespace-pre-wrap">
          {post.text}
        </div>
      )}

      {/* Media Content */}
      {post.media && post.media.length > 0 && (
        <div className="relative w-full aspect-square bg-secondary/30 overflow-hidden">
          {/* Main Media Image/Video */}
          <img 
            src={post.media[0].url || `${import.meta.env.BASE_URL}images/hero-bg.png`} 
            alt="Post media"
            className={cn(
              "w-full h-full object-cover transition-all duration-500",
              isLocked && "scale-110 blur-2xl opacity-60"
            )}
          />
          
          {/* PPV Lock Overlay */}
          {isLocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 flex items-center justify-center mb-4">
                <ShieldAlert className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-display font-semibold text-white mb-2">Locked Content</h3>
              <p className="text-sm text-white/70 mb-6 max-w-xs">
                This post is for subscribers only or requires a one-time unlock fee.
              </p>
              <PayButton 
                type="ppv"
                amountWld={post.ppvPriceWld || "1"}
                recipientId={post.creatorId}
                contentId={post.id}
                label={`Unlock for ${formatWld(post.ppvPriceWld)}`}
                className="w-full max-w-[240px] shadow-primary/30 shadow-xl"
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex gap-4">
            <button onClick={handleLike} className="flex items-center gap-1.5 text-muted-foreground hover:text-destructive transition-colors group">
              <Heart className={cn("w-6 h-6", optimisticLike && "fill-destructive text-destructive")} />
              <span className={cn("text-sm", optimisticLike && "text-destructive font-medium")}>{optimisticLikeCount}</span>
            </button>
            <Link href={`/post/${post.id}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <MessageCircle className="w-6 h-6" />
              <span className="text-sm">{post.commentCount || 0}</span>
            </Link>
            <button className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors">
              <PayButton 
                type="tip" 
                amountWld="1" 
                recipientId={post.creatorId} 
                contentId={post.id}
                variant="ghost" 
                className="p-0 h-auto hover:bg-transparent text-muted-foreground hover:text-primary"
                label="Tip"
                icon={<span className="font-bold text-lg leading-none mr-1.5">$</span>}
              />
            </button>
          </div>
          <div className="flex gap-4 text-muted-foreground">
            <button onClick={handleBookmark} className="hover:text-primary transition-colors">
              <Bookmark className={cn("w-6 h-6", post.isBookmarked && "fill-primary text-primary")} />
            </button>
            <button className="hover:text-foreground transition-colors">
              <Share2 className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
