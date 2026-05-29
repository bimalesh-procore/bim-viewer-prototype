// Item-types shown in the Related Items hub.
export type ItemCategory =
  | 'assets'
  | 'coordination-issues'
  | 'punch-list'
  | 'quality-inspections'
  | 'quality-observation'
  | 'rfis'
  | 'safety-inspections'
  | 'safety-observation'
  | 'submittals';

// View stack for the Related Items panel. The detail view carries the
// asset's display name so the outer panel header can show it without
// having to look it up asynchronously.
export type ItemsView =
  | { kind: 'hub' }
  | { kind: 'assets-list' }
  | { kind: 'asset-detail'; assetId: string; assetName: string }
  | { kind: 'category-placeholder'; category: ItemCategory; label: string };

export type AssetStatus = 'active' | 'in-repair' | 'inactive';

export type AssetDetailTab =
  | 'general'
  | 'doc'
  | 'field'
  | 'cx'
  | 'ops'
  | 'maintenance';

export interface PrimaryContact {
  initials: string;
  name: string;
  title: string;          // e.g. "Senior Project Engineer · Commissioning"
  phone: string;          // display-formatted
  email: string;
}

export interface SpecialtyContractor {
  name: string;
  initials: string;       // 2-char logo, e.g. "MM"
  trade: string;          // e.g. "Mechanical"
  category: string;       // e.g. "HVAC"
  rating: number;         // 0–5, e.g. 4.7
  address: string;        // full address as a single string
  phone: string;
  website: string;        // no protocol, e.g. "millermep.com"
  license: string;        // e.g. "TACLA #M-0042918"
  contractValue: string;  // display-formatted, e.g. "$184,500"
  onProject: string;      // display-formatted, e.g. "4 years"
  primaryContact: PrimaryContact;
}

export interface Asset {
  id: string;
  name: string;
  status: AssetStatus;

  // List-view fields
  category: string;        // e.g. "HVAC", "Plumbing" — also displayed as "Trade"
  location: string;        // short text shown on the tile
  lastServiceDate: string;
  commentCount: number;
  thumbnailUrl?: string;

  // Detail-view: General Information
  type: string;
  trade: string;
  code: string;
  description: string;
  projectLocation: string;
  latitude?: string;
  longitude?: string;
  photos: string[];
  favorite: boolean;

  // Detail-view: Specification Details
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  barcode?: string;

  // Detail-view: Maintenance Details
  installationDate?: string;
  warrantyStartDate?: string;
  warrantyExpiryDate?: string;
  maintenanceSchedule?: string; // e.g. "Quarterly"
  vendor?: string;              // typically same name as specialtyContractor.name
  nextServiceDate?: string;

  // Detail-view: Specialty Contractor (entire card optional)
  specialtyContractor?: SpecialtyContractor;

  // Bridge ID to the BIM element (expressID today, GUID later).
  linkedElementId: string;
}
