import { useEffect, useState, useMemo } from 'react';
import { Loader2, RefreshCw, Users, Globe, Image, CreditCard, TrendingUp, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { isAdminUser } from '../lib/admin';
import { Button } from '../components/ui';

type TimeRange = 'today' | 'week' | 'month' | 'all';

type AnalyticsData = {
  signups: number;
  extractions: number;
  imagesGenerated: number;
  checkoutsCompleted: number;
};

function getDateRangeStart(range: TimeRange): Date | null {
  const now = new Date();
  switch (range) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week':
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return weekAgo;
    case 'month':
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return monthAgo;
    case 'all':
      return null;
  }
}

export function AdminAnalytics() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [data, setData] = useState<AnalyticsData>({
    signups: 0,
    extractions: 0,
    imagesGenerated: 0,
    checkoutsCompleted: 0,
  });

  const canView = useMemo(() => isAdminUser(user?.id), [user?.id]);

  useEffect(() => {
    if (canView) {
      loadAnalytics();
    }
  }, [canView, timeRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const rangeStart = getDateRangeStart(timeRange);
      const rangeFilter = rangeStart ? rangeStart.toISOString() : null;

      // Fetch all metrics in parallel
      const [brandsResult, imagesResult, checkoutsResult, uniqueUsersResult] = await Promise.all([
        // Count brands (extractions)
        rangeFilter
          ? supabase.from('brands').select('id', { count: 'exact', head: true }).gte('created_at', rangeFilter)
          : supabase.from('brands').select('id', { count: 'exact', head: true }),

        // Count generated images
        rangeFilter
          ? supabase.from('images').select('id', { count: 'exact', head: true }).gte('created_at', rangeFilter)
          : supabase.from('images').select('id', { count: 'exact', head: true }),

        // Count completed checkouts using RPC (bypasses RLS)
        supabase.rpc('count_checkouts', { since_date: rangeFilter }),

        // Count unique users (from brands table)
        rangeFilter
          ? supabase.from('brands').select('user_id').gte('created_at', rangeFilter)
          : supabase.from('brands').select('user_id'),
      ]);

      // Calculate unique signups (users who created at least one brand)
      const uniqueUsers = new Set(uniqueUsersResult.data?.map(b => b.user_id) || []);

      setData({
        signups: uniqueUsers.size,
        extractions: brandsResult.count || 0,
        imagesGenerated: imagesResult.count || 0,
        checkoutsCompleted: checkoutsResult.data || 0,
      });
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  if (!canView) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <p className="text-neutral-500">Access denied</p>
      </div>
    );
  }

  const timeRangeLabels: Record<TimeRange, string> = {
    today: 'Today',
    week: 'Last 7 Days',
    month: 'Last 30 Days',
    all: 'All Time',
  };

  const metrics = [
    {
      label: 'Users',
      value: data.signups,
      icon: Users,
      color: 'bg-blue-500',
      description: 'Unique users who created brands',
    },
    {
      label: 'Extractions',
      value: data.extractions,
      icon: Globe,
      color: 'bg-purple-500',
      description: 'Brand extractions completed',
    },
    {
      label: 'Images Generated',
      value: data.imagesGenerated,
      icon: Image,
      color: 'bg-green-500',
      description: 'AI images created',
    },
    {
      label: 'Checkouts',
      value: data.checkoutsCompleted,
      icon: CreditCard,
      color: 'bg-amber-500',
      description: 'Completed payments',
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">Analytics Dashboard</h1>
            <p className="text-neutral-500 mt-1">Key metrics for your platform</p>
          </div>
          <Button
            variant="secondary"
            onClick={loadAnalytics}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Time Range Selector */}
        <div className="flex items-center gap-2 mb-6">
          <Calendar className="w-4 h-4 text-neutral-400" />
          <div className="flex bg-white rounded-lg border border-neutral-200 p-1">
            {(Object.keys(timeRangeLabels) as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  timeRange === range
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                }`}
              >
                {timeRangeLabels[range]}
              </button>
            ))}
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Metrics Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="bg-white rounded-xl border border-neutral-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-500">{metric.label}</p>
                    <p className="text-3xl font-bold text-neutral-900 mt-2">
                      {metric.value.toLocaleString()}
                    </p>
                    <p className="text-xs text-neutral-400 mt-2">{metric.description}</p>
                  </div>
                  <div className={`${metric.color} p-3 rounded-lg`}>
                    <metric.icon className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Conversion Funnel */}
        <div className="mt-8 bg-white rounded-xl border border-neutral-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-neutral-400" />
            <h2 className="text-lg font-semibold text-neutral-900">Conversion Funnel</h2>
          </div>

          {!loading && (
            <div className="space-y-4">
              {/* Funnel Steps */}
              <FunnelStep
                label="Users"
                value={data.signups}
                percentage={100}
                color="bg-blue-500"
              />
              <FunnelStep
                label="Extractions"
                value={data.extractions}
                percentage={data.signups > 0 ? (data.extractions / data.signups) * 100 : 0}
                color="bg-purple-500"
              />
              <FunnelStep
                label="Images Generated"
                value={data.imagesGenerated}
                percentage={data.signups > 0 ? Math.min((data.imagesGenerated / data.signups) * 100, 100) : 0}
                color="bg-green-500"
              />
              <FunnelStep
                label="Checkouts"
                value={data.checkoutsCompleted}
                percentage={data.signups > 0 ? (data.checkoutsCompleted / data.signups) * 100 : 0}
                color="bg-amber-500"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FunnelStep({
  label,
  value,
  percentage,
  color,
}: {
  label: string;
  value: number;
  percentage: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-32 text-sm font-medium text-neutral-700">{label}</div>
      <div className="flex-1 bg-neutral-100 rounded-full h-8 overflow-hidden">
        <div
          className={`${color} h-full rounded-full transition-all duration-500 flex items-center justify-end pr-3`}
          style={{ width: `${Math.max(percentage, 5)}%` }}
        >
          <span className="text-xs font-medium text-white">
            {value.toLocaleString()}
          </span>
        </div>
      </div>
      <div className="w-16 text-sm text-neutral-500 text-right">
        {percentage.toFixed(1)}%
      </div>
    </div>
  );
}
