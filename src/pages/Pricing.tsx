import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Check, Loader2, CreditCard } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';

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
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<any>(null);

  useEffect(() => {
    loadPlans();
    if (user) {
      loadUserPlan();
    }

    // Check for success/cancel from Stripe redirect
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');
    if (success) {
      // Reload user plan to show updated subscription
      if (user) {
        setTimeout(() => loadUserPlan(), 2000);
      }
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
      alert('Failed to create checkout session. Please try again.');
    } finally {
      setProcessing(null);
    }
  }


  const calculateYearlyDiscount = (monthlyPrice: number) => {
    const yearlyPrice = monthlyPrice * 12;
    const discountedYearly = yearlyPrice * 0.8; // 20% discount
    return {
      yearly: discountedYearly,
      savings: yearlyPrice - discountedYearly,
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-neutral-50 to-zinc-50 py-16 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">Pricing</h1>
          <p className="text-lg text-slate-600 mb-8">Simple, transparent pricing for every creator</p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <span className={`text-sm font-medium ${billingCycle === 'monthly' ? 'text-slate-900' : 'text-slate-500'}`}>
              Monthly
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                billingCycle === 'yearly' ? 'bg-purple-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  billingCycle === 'yearly' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${billingCycle === 'yearly' ? 'text-slate-900' : 'text-slate-500'}`}>
              Annual
              {billingCycle === 'yearly' && (
                <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">Save 20%</span>
              )}
            </span>
          </div>

          <div className="inline-flex items-center gap-2 bg-purple-50 text-purple-700 px-4 py-2 rounded-lg text-sm font-medium">
            <CreditCard className="w-4 h-4" />
            <span>1 credit = 1 image</span>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {plans.map((plan) => {
            const isActive = userPlan?.plan_name === plan.name;
            const isRecommended = plan.name === 'plus' && (!userPlan || userPlan?.plan_name === 'free');
            
            // Find user's current plan to determine upgrade/downgrade
            const currentUserPlan = plans.find(p => p.name === userPlan?.plan_name);
            const isDowngrade = currentUserPlan && plan.sort_order < currentUserPlan.sort_order;
            const isUpgrade = currentUserPlan && plan.sort_order > currentUserPlan.sort_order;
            
            const price = billingCycle === 'yearly' && plan.price_yearly
              ? plan.price_yearly / 12
              : plan.price_monthly;
            const displayPrice = billingCycle === 'yearly' && plan.price_yearly
              ? plan.price_yearly
              : plan.price_monthly;
            const costPerCredit = price > 0 ? (price / plan.credits_per_month).toFixed(2) : '0.00';

            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl shadow-lg p-8 ${
                  isRecommended ? 'ring-2 ring-purple-500' : ''
                } ${isActive ? 'ring-2 ring-green-500' : ''}`}
              >
                {isRecommended && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-purple-600 text-white px-4 py-1 rounded-full text-xs font-semibold">
                      Recommended
                    </span>
                  </div>
                )}
                {isActive && (
                  <div className="absolute -top-4 right-4">
                    <span className="bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                      ACTIVE
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">{plan.display_name}</h3>
                  <p className="text-slate-600 text-sm mb-4">{plan.description}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-slate-900">
                      ${billingCycle === 'yearly' && plan.price_yearly ? plan.price_yearly : plan.price_monthly}
                    </span>
                    {billingCycle === 'yearly' && plan.price_yearly && (
                      <span className="text-slate-500 text-sm">/year</span>
                    )}
                    {billingCycle === 'monthly' && (
                      <span className="text-slate-500 text-sm">/mo</span>
                    )}
                  </div>
                  {billingCycle === 'yearly' && plan.price_yearly && (
                    <p className="text-xs text-slate-500 mt-1">
                      ${(plan.price_yearly / 12).toFixed(2)}/month billed annually
                    </p>
                  )}
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 text-slate-700">
                      <CreditCard className="w-5 h-5 text-orange-500" />
                      <span className="font-medium">{plan.credits_per_month} credits/month</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Check className="w-5 h-5 text-green-500" />
                    <span className="text-sm">Credits reset monthly</span>
                  </div>
                  {plan.features.priority_support && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <Check className="w-5 h-5 text-green-500" />
                      <span className="text-sm">Priority support</span>
                    </div>
                  )}
                  {plan.features.usage_analytics && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <Check className="w-5 h-5 text-green-500" />
                      <span className="text-sm">Usage analytics</span>
                    </div>
                  )}
                </div>

                {plan.name !== 'free' && !isDowngrade && (
                  <button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={isActive || processing === plan.id}
                    className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
                      isActive
                        ? 'bg-green-100 text-green-700 cursor-not-allowed'
                        : isRecommended
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    } ${processing === plan.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {processing === plan.id ? (
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    ) : isActive ? (
                      'Current Plan'
                    ) : (
                      `${isUpgrade ? 'Upgrade' : 'Subscribe'}${billingCycle === 'yearly' ? ' Annually' : ''}`
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-16 text-center">
          <p className="text-slate-600">
            Need more credits or enterprise pricing?{' '}
            <a href="mailto:support@example.com" className="text-purple-600 hover:text-purple-700 font-medium">
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

