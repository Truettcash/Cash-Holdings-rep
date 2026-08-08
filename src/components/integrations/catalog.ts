/**
 * Presentation-only catalog for the Integrations workspace.
 * This describes how providers are grouped and labeled in the UI. It must
 * never be treated as a source of truth for what is actually wired — see
 * `src/lib/integrations/types.ts` (INTEGRATION_PROVIDERS) for that.
 */
import type { LucideIcon } from "lucide-react";
import {
  Instagram,
  Youtube,
  BarChart3,
  ShoppingBag,
  Mail,
  AppWindow,
  CalendarDays,
  ShoppingCart,
  CircleDollarSign,
  Facebook,
  Linkedin,
  Music2,
  AtSign,
  Github,
} from "lucide-react";

export type CatalogTier = "connected" | "available" | "future";

export type CatalogEntry = {
  id: string;
  name: string;
  description: string;
  tier: CatalogTier;
  icon: LucideIcon;
  category: string;
};

/** The four providers with real backend wiring (see INTEGRATION_PROVIDERS). */
export const CONNECTED_CATALOG: CatalogEntry[] = [
  {
    id: "instagram",
    name: "Instagram",
    description: "Per-brand engagement and reach metrics synced from Meta.",
    tier: "connected",
    icon: Instagram,
    category: "Social",
  },
  {
    id: "youtube",
    name: "YouTube",
    description: "Channel performance and video analytics.",
    tier: "connected",
    icon: Youtube,
    category: "Social",
  },
  {
    id: "google-analytics",
    name: "Google Analytics",
    description: "Site traffic and conversion data across brand properties.",
    tier: "connected",
    icon: BarChart3,
    category: "Analytics",
  },
  {
    id: "ebay",
    name: "eBay",
    description: "Marketplace orders, returns and listing sync.",
    tier: "connected",
    icon: ShoppingBag,
    category: "Commerce",
  },
];

/** Providers with no server-side connector yet — Connect surfaces an honest notice. */
export const AVAILABLE_CATALOG: CatalogEntry[] = [
  {
    id: "google",
    name: "Google Workspace",
    description: "Email, calendar and drive context for the operating team.",
    tier: "available",
    icon: Mail,
    category: "Productivity",
  },
  {
    id: "microsoft",
    name: "Microsoft 365",
    description: "Outlook and Teams context for the operating team.",
    tier: "available",
    icon: AppWindow,
    category: "Productivity",
  },
  {
    id: "calendly",
    name: "Calendly",
    description: "Scheduled calls and meeting activity.",
    tier: "available",
    icon: CalendarDays,
    category: "Productivity",
  },
];

/** Not yet planned for connector work — shown for roadmap visibility only. */
export const FUTURE_CATALOG: CatalogEntry[] = [
  { id: "shopify", name: "Shopify", description: "Storefront orders and inventory.", tier: "future", icon: ShoppingCart, category: "Commerce" },
  { id: "stripe", name: "Stripe", description: "Payments and payout reconciliation.", tier: "future", icon: CircleDollarSign, category: "Finance" },
  { id: "facebook", name: "Facebook", description: "Page insights and ad performance.", tier: "future", icon: Facebook, category: "Social" },
  { id: "linkedin", name: "LinkedIn", description: "Company page and post analytics.", tier: "future", icon: Linkedin, category: "Social" },
  { id: "tiktok", name: "TikTok", description: "Video performance and audience data.", tier: "future", icon: Music2, category: "Social" },
  { id: "threads", name: "Threads", description: "Post reach and engagement.", tier: "future", icon: AtSign, category: "Social" },
  { id: "github", name: "GitHub", description: "Repository and release activity.", tier: "future", icon: Github, category: "Engineering" },
];
