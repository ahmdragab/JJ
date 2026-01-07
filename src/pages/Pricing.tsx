import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Check, Loader2, CreditCard } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { Button } from '../components/ui';

interface Plan {
  id: string;
  name: string;
  display_name: string;
  description: string;
  price_monthly: number;
  price_yearly: number | null;
  credits_per_month: number;
  sort_order: number;
  features: {
    priority_support?: boolean;
    usage_analytics?: boolean;
  };
}

export function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<{ plan_name: string } | null>(null);

  useEffect(() => {
    loadPlans();
    if (user) {
      loadUserPlan();
    }

    const success = searchParams.get('success');
    if (success && user) {
      setTimeout(() => loadUserPlan(), 2000);
    }
  }, [user, searchParams]);

  async function loadPlans() {
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setPlans(data || []);
    } catch (error) {
      console.error('Error loading plans:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadUserPlan() {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('get_user_plan', {
        user_uuid: user.id,
      });

      if (error) throw error;
      if (data && data.length > 0) {
        setUserPlan(data[0]);
      }
    } catch (error) {
      console.error('Error loading user plan:', error);
    }
  }

  async function handleSubscribe(planId: string) {
    if (!user) {
      navigate('/');
      return;
    }

    setProcessing(planId);

    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          type: 'subscription',
          planId,
          billingCycle,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      toast.error('Checkout Failed', 'Failed to create checkout session. Please try again.');
    } finally {
      setProcessing(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-surface py-16 px-4 page-enter">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-neutral-800 mb-4 font-display">Pricing</h1>
          <p className="text-lg text-neutral-500 mb-8">Simple, transparent pricing for every creator</p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <span className={`text-sm font-medium transition-colors ${billingCycle === 'monthly' ? 'text-neutral-800' : 'text-neutral-400'}`}>
              Monthly
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors touch-manipulation ${
                billingCycle === 'yearly' ? 'bg-brand-primary' : 'bg-neutral-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                  billingCycle === 'yearly' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-sm font-medium transition-colors ${billingCycle === 'yearly' ? 'text-neutral-800' : 'text-neutral-400'}`}>
              Annual
              {billingCycle === 'yearly' && (
                <span className="ml-2 text-xs bg-brand-primary/10 text-brand-primary px-2 py-1 rounded-full font-semibold">
                  Save 20%
                </span>
              )}
            </span>
          </div>

          <div className="inline-flex items-center gap-2 bg-brand-primary/10 text-brand-primary px-4 py-2 rounded-xl text-sm font-medium">
            <CreditCard className="w-4 h-4" />
            <span>1 credit = 1 image</span>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {plans.map((plan, index) => {
            const isActive = userPlan?.plan_name === plan.name;
            const isRecommended = plan.name === 'plus' && (!userPlan || userPlan?.plan_name === 'free');

            const currentUserPlan = plans.find(p => p.name === userPlan?.plan_name);
            const isDowngrade = currentUserPlan && plan.sort_order < currentUserPlan.sort_order;
            const isUpgrade = currentUserPlan && plan.sort_order > currentUserPlan.sort_order;

            return (
              <div
                key={plan.id}
                className={`relative card p-8 stagger-fade-in ${
                  isRecommended ? 'ring-2 ring-brand-primary shadow-glow' : ''
                } ${isActive ? 'ring-2 ring-green-500' : ''}`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {isRecommended && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-brand-primary text-white px-4 py-1 rounded-full text-xs font-semibold shadow-lg">
                      Recommended
                    </span>
                  </div>
                )}
                {isActive && (
                  <div className="absolute -top-4 right-4">
                    <span className="bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold shadow-lg">
                      ACTIVE
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-neutral-800 mb-2 font-heading">{plan.display_name}</h3>
                  <p className="text-neutral-500 text-sm mb-4">{plan.description}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-neutral-800">
                      ${billingCycle === 'yearly' && plan.price_yearly ? plan.price_yearly : plan.price_monthly}
                    </span>
                    {billingCycle === 'yearly' && plan.price_yearly ? (
                      <span className="text-neutral-400 text-sm">/year</span>
                    ) : (
                      <span className="text-neutral-400 text-sm">/mo</span>
                    )}
                  </div>
                  {billingCycle === 'yearly' && plan.price_yearly && (
                    <p className="text-xs text-neutral-400 mt-1">
                      ${(plan.price_yearly / 12).toFixed(2)}/month billed annually
                    </p>
                  )}
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 text-neutral-700">
                      <CreditCard className="w-5 h-5 text-brand-primary" />
                      <span className="font-medium">{plan.credits_per_month} credits/month</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-600">
                    <Check className="w-5 h-5 text-green-500" />
                    <span className="text-sm">Credits reset monthly</span>
                  </div>
                  {plan.features.priority_support && (
                    <div className="flex items-center gap-2 text-neutral-600">
                      <Check className="w-5 h-5 text-green-500" />
                      <span className="text-sm">Priority support</span>
                    </div>
                  )}
                  {plan.features.usage_analytics && (
                    <div className="flex items-center gap-2 text-neutral-600">
                      <Check className="w-5 h-5 text-green-500" />
                      <span className="text-sm">Usage analytics</span>
                    </div>
                  )}
                </div>

                {plan.name !== 'free' && !isDowngrade && (
                  <Button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={isActive || processing === plan.id}
                    loading={processing === plan.id}
                    variant={isActive ? 'ghost' : isRecommended ? 'primary' : 'secondary'}
                    className={`w-full ${isActive ? 'bg-green-100 text-green-700' : ''}`}
                  >
                    {isActive
                      ? 'Current Plan'
                      : `${isUpgrade ? 'Upgrade' : 'Subscribe'}${billingCycle === 'yearly' ? ' Annually' : ''}`
                    }
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-16 text-center">
          <p className="text-neutral-500">
            Need more credits or enterprise pricing?{' '}
            <a href="mailto:support@alwan.io" className="text-brand-primary hover:text-brand-primary-hover font-medium transition-colors">
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
