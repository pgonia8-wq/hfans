import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuthStore } from "@/store/use-auth-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Lock, DollarSign, ArrowLeft, Search, MessageCircle } from "lucide-react";
import { MiniKit, Tokens, PaymentFinalStatus } from "@worldcoin/minikit-js";
import { cn, formatWld } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Conversation {
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  paidDmPriceWld?: string;
}

interface Message {
  id: string;
  senderId: string;
  text?: string;
  mediaUrl?: string;
  isPpv: boolean;
  ppvPriceWld?: string;
  isUnlocked: boolean;
  isRead: boolean;
  createdAt: string;
}

export default function Messages() {
  const { user } = useAuthStore();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoadingConvs, setIsLoadingConvs] = useState(true);
  const [isLoadingMsgs, setIsLoadingMsgs] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [search, setSearch] = useState("");
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/messages/conversations", { credentials: "include" })
      .then(r => r.json())
      .then(data => { setConversations(data.conversations || []); setIsLoadingConvs(false); })
      .catch(() => setIsLoadingConvs(false));
  }, []);

  useEffect(() => {
    if (!selectedConv) return;
    setIsLoadingMsgs(true);
    fetch(`/api/messages/${selectedConv.userId}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => { setMessages(data.messages || []); setIsLoadingMsgs(false); })
      .catch(() => setIsLoadingMsgs(false));
  }, [selectedConv]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConv || isSending) return;
    setIsSending(true);
    try {
      const r = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ receiverId: selectedConv.userId, text: newMessage.trim() }),
      });
      const data = await r.json() as { message?: Message };
      if (data.message) {
        setMessages(m => [...m, data.message!]);
        setNewMessage("");
      }
    } catch (e) { console.error(e); }
    finally { setIsSending(false); }
  };

  const unlockPpvMessage = async (msg: Message) => {
    if (!msg.ppvPriceWld || unlockingId) return;
    setUnlockingId(msg.id);
    try {
      const initRes = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "paid_message", recipientId: selectedConv?.userId, contentId: msg.id, amountWld: msg.ppvPriceWld }),
      });
      const init = await initRes.json() as any;

      if (MiniKit.isInstalled()) {
        const { finalPayload } = await MiniKit.commandsAsync.pay({
          reference: init.referenceId,
          to: init.to,
          tokens: [{ symbol: "WLD" as Tokens, token_amount: init.tokens[0].token_amount }],
          description: `Unlock message`,
          network: "worldchain",
        });
        if (finalPayload.status !== PaymentFinalStatus.Success) throw new Error("Payment failed");
        await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ referenceId: init.referenceId, transactionId: finalPayload.transaction_id }),
        });
      }
      // Refresh messages
      const r = await fetch(`/api/messages/${selectedConv?.userId}`, { credentials: "include" });
      const d = await r.json() as { messages: Message[] };
      setMessages(d.messages || []);
    } catch (e) { console.error(e); }
    finally { setUnlockingId(null); }
  };

  const filtered = conversations.filter(c =>
    (c.displayName || c.username).toLowerCase().includes(search.toLowerCase())
  );

  if (selectedConv) {
    return (
      <AppLayout hideTopBar hideBottomNav>
        <div className="flex flex-col h-[100dvh]">
          {/* Header */}
          <div className="flex items-center gap-3 p-4 border-b border-white/5 safe-area-pt bg-background/95 backdrop-blur">
            <button onClick={() => setSelectedConv(null)} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-full overflow-hidden bg-secondary flex-shrink-0">
              <img src={selectedConv.avatarUrl || `${import.meta.env.BASE_URL}images/default-avatar.png`} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{selectedConv.displayName || selectedConv.username}</div>
              <div className="text-xs text-muted-foreground">@{selectedConv.username}</div>
            </div>
            {selectedConv.paidDmPriceWld && (
              <div className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 rounded-full px-2 py-1">
                <DollarSign className="w-3 h-3" />
                {selectedConv.paidDmPriceWld} WLD/msg
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoadingMsgs ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <MessageCircle className="w-10 h-10 opacity-30" />
                <p className="text-sm">Start the conversation</p>
              </div>
            ) : (
              messages.map(msg => {
                const isMine = msg.senderId === user?.id;
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn("flex", isMine ? "justify-end" : "justify-start")}
                  >
                    {msg.isPpv && !msg.isUnlocked && !isMine ? (
                      <div className="max-w-[75%] bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
                        <Lock className="w-6 h-6 text-primary mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground mb-3">Locked message</p>
                        <Button
                          size="sm"
                          className="rounded-xl"
                          onClick={() => unlockPpvMessage(msg)}
                          disabled={unlockingId === msg.id}
                        >
                          {unlockingId === msg.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          Unlock for {msg.ppvPriceWld} WLD
                        </Button>
                      </div>
                    ) : (
                      <div className={cn(
                        "max-w-[75%] px-4 py-2.5 rounded-2xl text-sm",
                        isMine
                          ? "bg-primary text-black rounded-br-sm"
                          : "bg-white/10 text-foreground rounded-bl-sm"
                      )}>
                        {msg.text}
                      </div>
                    )}
                  </motion.div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-white/5 safe-area-pb bg-background">
            <div className="flex gap-2">
              <Input
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage()}
                placeholder={selectedConv.paidDmPriceWld ? `Message (${selectedConv.paidDmPriceWld} WLD)` : "Message..."}
                className="bg-white/8 border-white/15 rounded-2xl flex-1"
              />
              <Button
                size="icon"
                className="rounded-2xl w-10 h-10 flex-shrink-0"
                onClick={sendMessage}
                disabled={!newMessage.trim() || isSending}
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Messages">
      <div className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search messages..."
            className="bg-white/8 border-white/15 rounded-2xl pl-9"
          />
        </div>

        {isLoadingConvs ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
            <MessageCircle className="w-12 h-12 opacity-20" />
            <p className="text-sm">No conversations yet</p>
            <p className="text-xs text-center max-w-[200px]">Subscribe to creators to start messaging them</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map(conv => (
              <button
                key={conv.userId}
                onClick={() => setSelectedConv(conv)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 transition-colors text-left"
              >
                <div className="relative">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-secondary flex-shrink-0">
                    <img src={conv.avatarUrl || `${import.meta.env.BASE_URL}images/default-avatar.png`} alt="" className="w-full h-full object-cover" />
                  </div>
                  {(conv.unreadCount || 0) > 0 && (
                    <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center text-[10px] font-bold text-black">
                      {conv.unreadCount}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold truncate">{conv.displayName || conv.username}</span>
                    {conv.lastMessageAt && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {conv.paidDmPriceWld && <Lock className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                    <p className="text-sm text-muted-foreground truncate">{conv.lastMessage || "Start chatting"}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
