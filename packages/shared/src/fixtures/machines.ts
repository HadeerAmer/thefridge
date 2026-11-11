/**
 * The Fridge locations from @thefridge.eg (Locations highlight + posts, Nov 2026).
 * Pins are approximate. Sahel machines are seasonal and closed until next summer.
 */

export type MachineKind = "campus" | "office" | "beach";

export type MachineFixture = {
  id: string;
  name: string;
  venue: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
  kind: MachineKind;
  hours: string;
  isSeasonal: boolean;
  notice: string | null;
  /** Demo scenarios applied when the shelves are first filled. */
  scenario?: {
    soldOut?: string[];
    lowStock?: string[];
    expiringSoon?: string[];
  };
};

export const MACHINES: MachineFixture[] = [
  {
    id: "cbp-zayed",
    name: "Capital Business Park",
    venue: "Capital Business Park",
    area: "Sheikh Zayed",
    address: "Capital Business Park, 26th of July Corridor, Sheikh Zayed",
    lat: 30.0303,
    lng: 31.0083,
    kind: "office",
    hours: "Daily · 7 am – 11 pm",
    isSeasonal: false,
    notice: null,
    scenario: { lowStock: ["SAL-TACO", "BWL-CHIPOTLE"], expiringSoon: ["SAL-CRAB", "SND-TURKEY"] },
  },
  {
    id: "msa-october",
    name: "MSA University",
    venue: "MSA University",
    area: "6th of October",
    address: "MSA University, Wahat Road, 6th of October City",
    lat: 29.9711,
    lng: 30.9478,
    kind: "campus",
    hours: "Sat – Thu · 8 am – 7 pm",
    isSeasonal: false,
    notice: null,
    scenario: { soldOut: ["BWL-TERIYAKI"], expiringSoon: ["SAL-FATTOUSH"] },
  },
  {
    id: "miu-obour",
    name: "Misr International University",
    venue: "MIU",
    area: "Cairo–Ismailia Road",
    address: "MIU, KM 28 Cairo–Ismailia Road",
    lat: 30.1694,
    lng: 31.492,
    kind: "campus",
    hours: "Sat – Thu · 8 am – 6 pm",
    isSeasonal: false,
    notice: null,
    scenario: { soldOut: ["SAL-CAESAR"], lowStock: ["SAL-BURGER"], expiringSoon: ["WRP-TACO"] },
  },
  {
    id: "tkh-capital",
    name: "Coventry University · The Knowledge Hub",
    venue: "The Knowledge Hub Universities",
    area: "New Administrative Capital",
    address: "The Knowledge Hub Universities, New Administrative Capital",
    lat: 30.0236,
    lng: 31.7029,
    kind: "campus",
    hours: "Sun – Thu · 8 am – 7 pm",
    isSeasonal: false,
    notice: null,
    scenario: { lowStock: ["SAL-ASIAN"], expiringSoon: ["DST-BANOFFEE"] },
  },
  {
    id: "mv-ras-el-hikma",
    name: "Mountain View Ras El Hikma",
    venue: "Mountain View Ras El Hikma",
    area: "North Coast",
    address: "Mountain View, Ras El Hikma, North Coast",
    lat: 31.2054,
    lng: 27.8763,
    kind: "beach",
    hours: "Summer season",
    isSeasonal: true,
    notice: "Sahel season is over — see you next summer 🤍",
  },
  {
    id: "lavista-bay",
    name: "La Vista Bay",
    venue: "La Vista Bay",
    area: "North Coast",
    address: "La Vista Bay, North Coast",
    lat: 31.1052,
    lng: 28.2441,
    kind: "beach",
    hours: "Summer season",
    isSeasonal: true,
    notice: "Sahel season is over — see you next summer 🤍",
  },
  {
    id: "swan-lake",
    name: "Swan Lake North Coast",
    venue: "Swan Lake",
    area: "North Coast",
    address: "Swan Lake, North Coast",
    lat: 31.0919,
    lng: 28.326,
    kind: "beach",
    hours: "Summer season",
    isSeasonal: true,
    notice: "Sahel season is over — see you next summer 🤍",
  },
];

export const MACHINE_BY_ID = new Map(MACHINES.map((m) => [m.id, m]));
