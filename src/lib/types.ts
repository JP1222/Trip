export type ItineraryItem = {
  id: string;
  time?: string;
  title: string;
  description?: string;
  location?: string;
};

export type DayPlan = {
  day: number;
  date: string;
  title: string;
  items: ItineraryItem[];
};

export type Trip = {
  id: string;
  title: string;
  subtitle: string;
  destination: string;
  startDate: string;
  endDate: string;
  coverGradient: string;
  coverEmoji: string;
  /** Optional cover photo URL for the wall */
  coverImage?: string;
  /** Extra showcase images (URLs) until friends upload real shots */
  showcase?: { src: string; caption: string }[];
  summary: string;
  members: string[];
  days: DayPlan[];
  tips?: string[];
};

export type PhotoMeta = {
  id: string;
  tripId: string;
  filename: string;
  originalName: string;
  uploader: string;
  caption?: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

export type Comment = {
  id: string;
  tripId: string;
  author: string;
  body: string;
  createdAt: string;
};
