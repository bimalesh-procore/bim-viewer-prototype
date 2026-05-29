import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Phone,
  Plus,
  Star,
} from 'lucide-react';
import { getAssetById } from './assetsData';
import type {
  Asset,
  AssetDetailTab,
  AssetStatus,
  SpecialtyContractor,
} from './types';

interface AssetDetailViewProps {
  assetId: string;
}

const TABS: { id: AssetDetailTab; label: string }[] = [
  { id: 'general',     label: 'General'     },
  { id: 'doc',         label: 'Doc'         },
  { id: 'field',       label: 'Field'       },
  { id: 'cx',          label: 'Cx'          },
  { id: 'ops',         label: 'Ops'         },
  { id: 'maintenance', label: 'Maintenance' },
];

const STATUS_PILL: Record<AssetStatus, { label: string; className: string }> = {
  active:      { label: 'Active',    className: 'bg-[#DCFCE7] text-[#166534]' },
  'in-repair': { label: 'In Repair', className: 'bg-[#FFEFD6] text-[#8A5A00]' },
  inactive:    { label: 'Inactive',  className: 'bg-[#EEF0F1] text-[#5E696E]' },
};

export function AssetDetailView({ assetId }: AssetDetailViewProps) {
  const [asset, setAsset] = useState<Asset | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<AssetDetailTab>('general');
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    getAssetById(assetId).then((found) => {
      if (alive) setAsset(found);
    });
    return () => {
      alive = false;
    };
  }, [assetId]);

  if (!asset) {
    return <div className="px-4 py-6 text-sm text-gray-500">Asset not found</div>;
  }

  return (
    <div className="flex flex-col bg-[#F4F5F6]">
      {/* Tab bar */}
      <div className="flex items-center gap-4 overflow-x-auto border-b border-[#D6DADC] bg-white px-4">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={
                'whitespace-nowrap py-2 text-sm transition-colors ' +
                (isActive
                  ? 'border-b-2 border-[#1D5CC9] text-[#1D5CC9] font-semibold -mb-px'
                  : 'text-[#5E696E] hover:text-[#232729]')
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'general' && (
        <OverviewTab
          asset={asset}
          selectedPhotoIdx={selectedPhotoIdx}
          setSelectedPhotoIdx={setSelectedPhotoIdx}
        />
      )}

      {activeTab !== 'general' && (
        <div className="px-4 py-10 text-center text-sm text-[#5E696E]">
          {TABS.find((t) => t.id === activeTab)?.label} content to be added.
        </div>
      )}
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────

interface OverviewTabProps {
  asset: Asset;
  selectedPhotoIdx: number;
  setSelectedPhotoIdx: (n: number) => void;
}

function OverviewTab({ asset, selectedPhotoIdx, setSelectedPhotoIdx }: OverviewTabProps) {
  const status = STATUS_PILL[asset.status];
  const currentPhoto = asset.photos[selectedPhotoIdx];

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      {/* Photo hero */}
      <div className="relative overflow-hidden rounded-lg bg-[#D6DADC]">
        <div className="aspect-[4/3] w-full">
          {currentPhoto ? (
            <img src={currentPhoto} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[#75838A]">
              <ImageIcon size={48} strokeWidth={1.5} />
            </div>
          )}
        </div>
        {asset.favorite && (
          <button
            type="button"
            aria-label="Favorite"
            className="absolute left-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#FF5100] text-white shadow-sm"
          >
            <Star size={16} strokeWidth={2} fill="currentColor" />
          </button>
        )}
      </div>

      {/* Thumbnail row */}
      <div className="flex items-center gap-2">
        {asset.photos.map((src, i) => (
          <button
            key={src + i}
            type="button"
            onClick={() => setSelectedPhotoIdx(i)}
            className={
              'relative h-14 w-14 overflow-hidden rounded-md border-2 ' +
              (i === selectedPhotoIdx ? 'border-[#1D5CC9]' : 'border-transparent')
            }
          >
            <img src={src} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
        {asset.photos.length === 0 && (
          <div className="flex h-14 w-14 items-center justify-center rounded-md border-2 border-[#1D5CC9] bg-[#D6DADC] text-[#75838A]">
            <ImageIcon size={20} strokeWidth={1.5} />
          </div>
        )}
        <button
          type="button"
          aria-label="Add photo"
          className="flex h-14 w-14 items-center justify-center rounded-md border border-[#D6DADC] bg-white text-[#5E696E] hover:border-[#1D5CC9] hover:text-[#1D5CC9]"
        >
          <Plus size={20} strokeWidth={2} />
        </button>
      </div>

      {/* General Information */}
      <CollapsibleCard title="General Information" defaultOpen>
        <Row label="Type" required value={asset.type} />
        <Row label="Trade" value={asset.trade} />
        <Row label="Name" required value={asset.name} />
        <Row label="Code" value={asset.code} />
        <Row
          label="Status"
          required
          value={
            <span
              className={`inline-flex items-center rounded-full px-3 py-0.5 text-sm font-medium ${status.className}`}
            >
              {status.label}
            </span>
          }
        />
        <Row label="Description" value={asset.description} multiline />
        <Row label="Project Location" value={asset.projectLocation} />
        {asset.latitude && <Row label="Latitude" value={asset.latitude} />}
        {asset.longitude && <Row label="Longitude" value={asset.longitude} />}
      </CollapsibleCard>

      {/* Specification Details */}
      {hasAnySpec(asset) && (
        <CollapsibleCard title="Specification Details" defaultOpen>
          {asset.manufacturer && <Row label="Manufacturer"  value={asset.manufacturer} />}
          {asset.model        && <Row label="Model"         value={asset.model} />}
          {asset.serialNumber && <Row label="Serial Number" value={asset.serialNumber} />}
          {asset.barcode      && <Row label="Barcode"       value={asset.barcode} />}
        </CollapsibleCard>
      )}

      {/* Maintenance Details */}
      {hasAnyMaintenance(asset) && (
        <CollapsibleCard title="Maintenance Details" defaultOpen>
          {asset.installationDate    && <Row label="Installation Date"    value={asset.installationDate} />}
          {asset.warrantyStartDate   && <Row label="Warranty Start Date"  value={asset.warrantyStartDate} />}
          {asset.warrantyExpiryDate  && <Row label="Warranty Expiry Date" value={asset.warrantyExpiryDate} />}
          {asset.maintenanceSchedule && <Row label="Maintenance Schedule" value={asset.maintenanceSchedule} />}
          {asset.vendor              && <Row label="Vendor"               value={asset.vendor} />}
          <Row label="Last Service" value={asset.lastServiceDate} />
          {asset.nextServiceDate && <Row label="Next Service" value={asset.nextServiceDate} />}
        </CollapsibleCard>
      )}

      {/* Specialty Contractor */}
      {asset.specialtyContractor && (
        <SpecialtyContractorCard contractor={asset.specialtyContractor} />
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function hasAnySpec(a: Asset): boolean {
  return Boolean(a.manufacturer || a.model || a.serialNumber || a.barcode);
}

function hasAnyMaintenance(a: Asset): boolean {
  return Boolean(
    a.installationDate || a.warrantyStartDate || a.warrantyExpiryDate ||
    a.maintenanceSchedule || a.vendor || a.nextServiceDate,
  );
}

// ─── CollapsibleCard ──────────────────────────────────────────────────────

interface CollapsibleCardProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleCard({ title, defaultOpen = true, children }: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-base font-semibold text-[#232729]">{title}</span>
        {open ? (
          <ChevronUp size={18} strokeWidth={2} className="text-[#5E696E]" />
        ) : (
          <ChevronDown size={18} strokeWidth={2} className="text-[#5E696E]" />
        )}
      </button>
      {open && (
        <dl className="divide-y divide-[#EEF0F1] border-t border-[#EEF0F1]">
          {children}
        </dl>
      )}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────

interface RowProps {
  label: string;
  value: React.ReactNode;
  required?: boolean;
  multiline?: boolean;
}

function Row({ label, value, required = false, multiline = false }: RowProps) {
  return (
    <div className={'flex gap-4 px-4 py-3 ' + (multiline ? 'items-start' : 'items-center')}>
      <dt className="flex-shrink-0 text-sm text-[#5E696E]">
        {label}
        {required && <span className="ml-0.5 text-[#D11500]">*</span>}
      </dt>
      <dd
        className={
          'flex-1 text-right text-sm text-[#232729] ' +
          (multiline ? 'whitespace-pre-line leading-relaxed' : 'truncate')
        }
      >
        {value}
      </dd>
    </div>
  );
}

// ─── Specialty Contractor card ────────────────────────────────────────────

function SpecialtyContractorCard({ contractor }: { contractor: SpecialtyContractor }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-base font-semibold text-[#232729]">Specialty Contractor</span>
        {open ? (
          <ChevronUp size={18} strokeWidth={2} className="text-[#5E696E]" />
        ) : (
          <ChevronDown size={18} strokeWidth={2} className="text-[#5E696E]" />
        )}
      </button>
      {open && (
        <div className="border-t border-[#EEF0F1]">
          {/* Logo + name + rating */}
          <div className="flex items-start gap-3 px-4 py-3">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-md bg-[#1F2A44] text-base font-semibold text-white">
              {contractor.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold text-[#232729]">
                {contractor.name}
              </div>
              <div className="truncate text-sm text-[#5E696E]">
                {contractor.trade} · {contractor.category}
              </div>
              <div className="mt-1 flex items-center gap-1 text-sm text-[#232729]">
                <StarRow rating={contractor.rating} />
                <span className="ml-1 text-[#5E696E]">{contractor.rating.toFixed(1)}</span>
              </div>
            </div>
          </div>

          {/* Fields */}
          <dl className="divide-y divide-[#EEF0F1] border-t border-[#EEF0F1]">
            <Row label="Address" value={contractor.address} multiline />
            <Row label="Phone" value={<LinkText className="text-[#1D5CC9]">{contractor.phone}</LinkText>} />
            <Row label="Website" value={<LinkText className="text-[#1D5CC9]">{contractor.website}</LinkText>} />
            <Row label="License" value={contractor.license} />
            <Row label="Contract Value" value={contractor.contractValue} />
            <Row label="On Project" value={contractor.onProject} />
          </dl>

          {/* Primary point of contact sub-card */}
          <div className="m-3 rounded-md border border-[#E5E7EB] bg-[#F9FAFB] p-3">
            <div className="mb-2 text-[11px] font-semibold tracking-wider text-[#5E696E]">
              PRIMARY POINT OF CONTACT
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#D14545] text-sm font-semibold text-white">
                {contractor.primaryContact.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-[#232729]">
                  {contractor.primaryContact.name}
                </div>
                <div className="text-sm text-[#5E696E]">
                  {contractor.primaryContact.title}
                </div>
                <div className="mt-1 text-sm text-[#1D5CC9]">{contractor.primaryContact.phone}</div>
                <div className="text-sm text-[#1D5CC9]">{contractor.primaryContact.email}</div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-md bg-[#3B5BDB] py-2 text-sm font-semibold text-white hover:bg-[#314FB8]"
              >
                Email
              </button>
              <button
                type="button"
                className="flex-1 rounded-md border border-[#D6DADC] bg-white py-2 text-sm font-semibold text-[#232729] hover:bg-[#F4F5F6]"
              >
                <span className="inline-flex items-center gap-1">
                  <Phone size={14} strokeWidth={2} />
                  Call
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Small UI pieces ──────────────────────────────────────────────────────

function StarRow({ rating }: { rating: number }) {
  // Visually simple: 5 stars, filled count = round(rating).
  const filled = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          size={14}
          strokeWidth={1.5}
          className={i < filled ? 'text-[#F59E0B]' : 'text-[#D6DADC]'}
          fill={i < filled ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  );
}

function LinkText({ children, className }: { children: React.ReactNode; className?: string }) {
  // No href yet — visual only. Could be promoted to <a> if we want real linking.
  return <span className={className}>{children}</span>;
}
