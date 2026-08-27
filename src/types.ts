export type CardTheme = "corporate" | "professional" | "modern" | "minimal" | "executive" | "creative";

export type PlanId = "basic" | "pro";

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  templates: CardTheme[];
  customColor: boolean;
  logoUpload: boolean;
  customBackground: boolean;
  quickActions: boolean;
}

export type BackgroundStyle = "none" | "dots" | "diagonal" | "gradient" | "custom";

export interface CardData {
  template: CardTheme;
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  mobile: string;
  email: string;
  website: string;
  address: string;
  linkedin: string;
  facebook: string;
  instagram: string;
  whatsapp: string;
  accentColor: string;
  logoUrl: string;
  background: BackgroundStyle;
  backgroundImageUrl: string;
}

export type BuilderStep = "template" | "details" | "customize" | "preview" | "payment" | "status";

export type PaymentStatus =
  | "pending"
  | "submitted"
  | "under_verification"
  | "approved"
  | "rejected"
  | "provisioned";

export interface Order {
  id: string;
  customer: string;
  email: string;
  template: CardTheme;
  amount: number;
  method: "gcash" | "bank";
  paymentRef: string;
  status: PaymentStatus;
  submittedAt: string;
  card: CardData;
}
