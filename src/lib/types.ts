/** One ad × one day, after all Windsor batches are joined. */
export interface AdRow {
  date: string;
  accountName: string;
  campaign: string;
  adset: string;
  adName: string;
  objective: string;
  campaignStatus: string;

  // Raw counters only. Every ratio is derived in metrics.ts from sums, never
  // fetched — Windsor's per-row ctr/cpc/cpm are row-level averages and summing
  // or re-averaging them across rows gives the wrong answer.
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  uniqueClicks: number;
  linkClicks: number;
  landingPageViews: number;
  videoViews: number;
  /**
   * `actions_lead` — QUALIFIED leads only. The funnel reports a lead to Meta
   * exclusively when its score clears 3, so this is a subset of registrations,
   * not a separate event and not the top of the funnel.
   */
  leads: number;
  /** `actions_complete_registration` — everyone who registered. The parent set. */
  registrations: number;
  purchases: number;
  purchaseValue: number;
}

/** Every KPI the dashboard can show for any slice of rows. */
export interface Metrics {
  // sums
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  uniqueClicks: number;
  linkClicks: number;
  landingPageViews: number;
  videoViews: number;
  leads: number;
  registrations: number;
  purchases: number;
  purchaseValue: number;
  days: number;

  // derived — delivery
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  linkCtr: number | null;
  frequency: number | null;
  costPerLandingPageView: number | null;

  costPerLinkClick: number | null;
  /** link clicks ÷ clicks — how much of the click volume is actually outbound */
  linkClickRate: number | null;
  /**
   * landing page views ÷ link clicks. The single best broken-funnel detector:
   * people clicked through and never arrived. A low value means a dead link, a
   * slow page, or a pixel that is not firing.
   */
  landingArrivalRate: number | null;
  /** unique clicks ÷ reach — click rate per person rather than per impression */
  uniqueCtr: number | null;

  // derived — acquisition
  cpl: number | null; // cost per QUALIFIED lead
  cpr: number | null; // cost per registration = cost per TOTAL lead
  leadRate: number | null; // qualified leads / link clicks
  clickToLeadRate: number | null; // qualified leads / clicks
  /** qualified leads ÷ registrations — how much of the intake clears scoring */
  qualificationRate: number | null;
  registrationRate: number | null; // registrations / landing page views
  lpvToLeadRate: number | null;
  costPerPurchase: number | null;
  platformRoas: number | null; // purchaseValue / spend (Meta-reported)
  dailySpend: number | null;
}

export interface TicketSale {
  id: string;
  name: string;
  price: number;
  units: number;
}

export interface ExtraCost {
  id: string;
  name: string;
  amount: number;
}

/**
 * A launch (webinar, VSL, challenge...). Ad numbers are pulled automatically
 * from Windsor using the date window + campaign filter; everything the ad
 * platform cannot know is entered by hand.
 */
export interface Launch {
  id: string;
  name: string;
  eventDate: string; // e.g. the webinar day
  startDate: string; // attribution window start (inclusive)
  endDate: string; // attribution window end (inclusive)
  campaigns: string[]; // empty = all campaigns

  // manual funnel — the part Meta never sees
  registrationsManual: number | null; // overrides the platform number when set
  showUps: number; // people who actually attended
  stayedToOffer: number; // still watching when the offer dropped
  callsBooked: number;
  callsTaken: number;

  // manual revenue
  tickets: TicketSale[];
  cashCollected: number; // money actually in the bank
  extraCosts: ExtraCost[]; // setters, closers, tooling, platform fees

  notes: string;
}

export interface LaunchMetrics {
  ads: Metrics;
  registrations: number;
  showUps: number;
  stayedToOffer: number;
  callsBooked: number;
  callsTaken: number;

  unitsSold: number;
  contractedRevenue: number;
  cashCollected: number;
  extraCostTotal: number;
  totalCost: number;

  // rates
  showUpRate: number | null;
  stayRate: number | null;
  bookingRate: number | null;
  callShowRate: number | null;
  closeRate: number | null; // units / showUps
  callCloseRate: number | null; // units / callsTaken
  cashCollectionRate: number | null;

  // money
  aov: number | null;
  cac: number | null; // ad spend / unit
  fullCac: number | null; // total cost / unit
  costPerShowUp: number | null;
  costPerCall: number | null;
  roas: number | null; // contracted / ad spend
  cashRoas: number | null; // cash / ad spend
  netRoas: number | null; // cash / total cost
  profit: number; // cash - total cost; always computable, unlike the ratios
  margin: number | null;
  breakevenRoas: number | null;
  earningsPerLead: number | null;
  earningsPerShowUp: number | null;
}

export interface CreativeAnalysis {
  id: string;
  adName: string;
  kind: "image" | "script";
  /** data: URI, kept so the analysis stays reviewable later */
  imageDataUrl?: string;
  mediaType?: string;
  script?: string;
  /** markdown returned by Claude */
  analysis: string;
  hooks: string[];
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  scores: Record<string, number>;
  /** what the ad's numbers looked like at analysis time */
  snapshot: Partial<Metrics> | null;
  createdAt: string;
  model: string;
}

export interface AiReport {
  id: string;
  createdAt: string;
  scope: string;
  markdown: string;
  model: string;
}

export interface Store {
  launches: Launch[];
  creatives: CreativeAnalysis[];
  reports: AiReport[];
  settings: {
    currency: string;
    /** monthly fixed cost, spread per day, folded into blended CPL when set */
    monthlyOverhead: number;
    targetCpl: number | null;
    targetRoas: number | null;
  };
}

/**
 * Windsor's `date_preset` grammar is narrow — `last_Xd`, `last_Xw`, `last_Xm`,
 * `this_month`, `this_year` and their `T` ("includes today") variants. Anything
 * else is rejected outright, so these ids map 1:1 onto values it accepts.
 *
 * Rolling presets deliberately EXCLUDE today: a half-finished day drags the CPL
 * trend down and makes every comparison look better than it is. Use the `today`
 * range when you want the live, partial view.
 */
export type RangeId =
  | "today"
  | "yesterday"
  | "last_7d"
  | "last_14d"
  | "last_30d"
  | "last_90d"
  | "this_month"
  | "custom";

export interface DateRange {
  id: RangeId;
  /** inclusive ISO date, only for the day-exact and custom ranges */
  from?: string;
  to?: string;
}
