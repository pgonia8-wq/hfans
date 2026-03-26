import { useGetFeed } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PostCard } from "@/components/feed/PostCard";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

function StoryBar() {
  // Mock stories since API hooks might be empty
  const mockStories = [
    { id: 1, user: "Elena", avatar: `${import.meta.env.BASE_URL}images/default-avatar.png`, hasUnseen: true },
    { id: 2, user: "Jayden", avatar: `${import.meta.env.BASE_URL}images/default-avatar.png`, hasUnseen: true },
    { id: 3, user: "Mia", avatar: `${import.meta.env.BASE_URL}images/default-avatar.png`, hasUnseen: false },
  ];

  return (
    <div className="w-full bg-background border-b border-white/5 py-3 overflow-x-auto hide-scrollbar">
      <div className="flex px-4 gap-4 w-max">
        {/* Add story button */}
        <div className="flex flex-col items-center gap-1 cursor-pointer">
          <div className="w-16 h-16 rounded-full border border-dashed border-white/20 flex items-center justify-center bg-white/5">
            <span className="text-2xl text-primary font-light">+</span>
          </div>
          <span className="text-xs text-muted-foreground font-medium">Add</span>
        </div>
        
        {/* Stories */}
        {mockStories.map(story => (
          <div key={story.id} className="flex flex-col items-center gap-1 cursor-pointer">
            <div className={cn(
              "w-16 h-16 rounded-full p-[2px]",
              story.hasUnseen ? "bg-gradient-to-tr from-primary to-blue-300" : "bg-white/10"
            )}>
              <div className="w-full h-full rounded-full border-2 border-background overflow-hidden">
                <img src={story.avatar} alt={story.user} className="w-full h-full object-cover" />
              </div>
            </div>
            <span className="text-xs text-foreground/80 font-medium">{story.user}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const { data: feedData, isLoading } = useGetFeed({ page: 1, limit: 10 });

  return (
    <AppLayout>
      <StoryBar />
      
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }}
          className="pb-6"
        >
          {feedData?.posts?.length ? (
            feedData.posts.map(post => (
              <PostCard key={post.id} post={post} />
            ))
          ) : (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl">✨</span>
              </div>
              <p className="font-medium text-foreground mb-1">Your feed is quiet</p>
              <p className="text-sm">Find creators to subscribe to in Explore</p>
            </div>
          )}
        </motion.div>
      )}
    </AppLayout>
  );
}

