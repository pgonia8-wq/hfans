import { useGetCreatorDashboard, useGetCreatorEarnings } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { formatWld } from "@/lib/utils";
import { Loader2, TrendingUp, Users, DollarSign, Activity } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const { data: dash, isLoading } = useGetCreatorDashboard();
  const { data: earnings } = useGetCreatorEarnings({ period: 'month' });

  return (
    <AppLayout title="Creator Dashboard" hideBottomNav={false}>
      {isLoading || !dash ? (
        <div className="flex items-center justify-center p-12 h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="p-4 space-y-6">
          
          {/* Top Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4 bg-primary/10 border-primary/20">
              <div className="flex items-center gap-2 text-primary mb-2">
                <DollarSign className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Earnings (WLD)</span>
              </div>
              <div className="text-2xl font-bold">{formatWld(dash.totalEarningsWld).replace(' WLD', '')}</div>
              <div className="text-xs text-primary/80 mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> +12% this month
              </div>
            </Card>

            <Card className="p-4 bg-card border-white/5">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Users className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Subscribers</span>
              </div>
              <div className="text-2xl font-bold text-foreground">{dash.subscriberCount}</div>
              <div className="text-xs text-green-500 mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> +{dash.newSubscribersThisMonth || 0} new
              </div>
            </Card>
          </div>

          {/* Chart Section */}
          <Card className="p-5 border-white/5 bg-card">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Revenue Over Time
            </h3>
            <div className="h-[200px] w-full">
              {earnings?.breakdown ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={earnings.breakdown}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={['dataMin', 'auto']} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#141414', border: '1px solid #333', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm border border-dashed border-white/10 rounded-xl">
                  Not enough data to display
                </div>
              )}
            </div>
          </Card>

          {/* Quick Actions */}
          <div>
            <h3 className="font-semibold mb-3 px-1 text-foreground/90">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <button className="p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-left transition-colors">
                <div className="font-medium mb-1">Create Post</div>
                <div className="text-xs text-muted-foreground">Share content with subs</div>
              </button>
              <button className="p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-left transition-colors">
                <div className="font-medium mb-1">Go Live</div>
                <div className="text-xs text-muted-foreground">Start a stream</div>
              </button>
            </div>
          </div>
          
        </div>
      )}
    </AppLayout>
  );
}
