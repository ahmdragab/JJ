// Analytics Event Type Definitions

// Authentication Events
export interface UserSignedUpEvent {
  method: 'email' | 'google';
}

export interface UserLoggedInEvent {
  method: 'email' | 'google';
}

export interface UserLoggedOutEvent {}

// Brand Events
export interface BrandExtractionStartedEvent {
  domain: string;
}

export interface BrandExtractionCompletedEvent {
  domain: string;
  brand_id: string;
  has_logo: boolean;
  has_colors: boolean;
  duration_ms: number;
}

export interface BrandExtractionFailedEvent {
  domain: string;
  error_type: string;
}

export interface BrandConfirmedEvent {
  brand_id: string;
}

export interface BrandDeletedEvent {
  brand_id: string;
}

// Image Generation Events
export interface GenerationStartedEvent {
  brand_id: string;
  prompt_length: number;
  aspect_ratio: string;
  platform: string;
  has_style: boolean;
  has_product: boolean;
}

export interface GenerationCompletedEvent {
  brand_id: string;
  image_id: string;
  duration_ms: number;
  credits_used: number;
}

export interface GenerationFailedEvent {
  brand_id: string;
  error_type: string;
}

export interface InsufficientCreditsEvent {
  brand_id: string;
  credits_needed: number;
}

// Image Interaction Events
export interface ImageDownloadedEvent {
  image_id: string;
  format: string;
}

export interface ImageSharedEvent {
  image_id: string;
  method: string;
}

export interface ImageEditedEvent {
  image_id: string;
  version_number: number;
}

export interface ImageDeletedEvent {
  image_id: string;
}

// UI Engagement Events
export interface StyleSelectedEvent {
  style_id: string;
  style_name: string;
  category: string;
}

export interface ProductAddedEvent {
  product_url: string;
  success: boolean;
}

export interface AssetUploadedEvent {
  asset_type: string;
  file_type: string;
  count: number;
}

export interface PlatformSelectedEvent {
  platform: string;
  aspect_ratio: string;
}

export interface PromptFocusedEvent {
  page: string;
}

// Payment Events
export interface PricingViewedEvent {
  current_credits: number;
}

export interface CheckoutStartedEvent {
  plan_id: string;
  plan_name: string;
  billing_cycle: 'monthly' | 'yearly' | 'one_time';
  amount: number;
}

export interface SubscriptionCreatedEvent {
  plan_id: string;
  plan_name: string;
  billing_cycle: 'monthly' | 'yearly';
  amount: number;
}

export interface SubscriptionRenewedEvent {
  plan_id: string;
  amount: number;
}

export interface SubscriptionCanceledEvent {
  plan_id: string;
  reason?: string;
}

export interface CreditsPurchasedEvent {
  package_id: string;
  credits: number;
  amount: number;
}

// Navigation Events
export interface PageViewedEvent {
  page: string;
  brand_id?: string;
}

export interface BrandSwitchedEvent {
  from_brand_id: string;
  to_brand_id: string;
}

// Event Map for type-safe tracking
export interface AnalyticsEventMap {
  // Auth
  user_signed_up: UserSignedUpEvent;
  user_logged_in: UserLoggedInEvent;
  user_logged_out: UserLoggedOutEvent;

  // Brand
  brand_extraction_started: BrandExtractionStartedEvent;
  brand_extraction_completed: BrandExtractionCompletedEvent;
  brand_extraction_failed: BrandExtractionFailedEvent;
  brand_confirmed: BrandConfirmedEvent;
  brand_deleted: BrandDeletedEvent;

  // Generation
  generation_started: GenerationStartedEvent;
  generation_completed: GenerationCompletedEvent;
  generation_failed: GenerationFailedEvent;
  insufficient_credits: InsufficientCreditsEvent;

  // Image Interaction
  image_downloaded: ImageDownloadedEvent;
  image_shared: ImageSharedEvent;
  image_edited: ImageEditedEvent;
  image_deleted: ImageDeletedEvent;

  // UI Engagement
  style_selected: StyleSelectedEvent;
  product_added: ProductAddedEvent;
  asset_uploaded: AssetUploadedEvent;
  platform_selected: PlatformSelectedEvent;
  prompt_focused: PromptFocusedEvent;

  // Payment
  pricing_viewed: PricingViewedEvent;
  checkout_started: CheckoutStartedEvent;
  subscription_created: SubscriptionCreatedEvent;
  subscription_renewed: SubscriptionRenewedEvent;
  subscription_canceled: SubscriptionCanceledEvent;
  credits_purchased: CreditsPurchasedEvent;

  // Navigation
  page_viewed: PageViewedEvent;
  brand_switched: BrandSwitchedEvent;
}

export type AnalyticsEventName = keyof AnalyticsEventMap;

// User properties for identification
export interface UserProperties {
  email?: string;
  name?: string;
  created_at?: string;
  plan?: string;
  credits?: number;
}
