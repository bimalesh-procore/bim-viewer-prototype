import { ChevronDown, HelpCircle, MessageSquare, Bell, Menu } from 'lucide-react';
import cogIcon from '../../assets/icons/model-manager/cog.svg';

function SiteHeader() {
  return (
    <div
      className="flex items-center shrink-0 px-4 gap-4"
      style={{ backgroundColor: '#1A1F2C', height: 52 }}
    >
      {/* Left: Menu + Procore logo + project switcher */}
      <div className="flex items-center gap-4">
        <button type="button" className="flex items-center gap-1.5 text-white opacity-80 hover:opacity-100">
          <Menu size={18} />
          <span className="text-sm font-medium">Menu</span>
        </button>

        <span className="text-white font-black text-base tracking-wider select-none">PROCORE</span>

        <button
          type="button"
          className="flex items-center gap-2 rounded px-2 py-1 hover:bg-white/10 transition-colors"
        >
          {/* Project thumbnail */}
          <div className="w-8 h-8 rounded overflow-hidden shrink-0 bg-[#2E3A4E] flex items-center justify-center">
            <div className="w-full h-full bg-gradient-to-br from-slate-600 to-slate-800" />
          </div>
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[10px] text-white/60">Vertigo Construction</span>
            <span className="text-sm font-semibold text-white">Seattle Corridor Railway</span>
          </div>
          <ChevronDown size={14} className="text-white/60 ml-1" />
        </button>
      </div>

      {/* Center: Search */}
      <div className="flex-1 flex justify-center">
        <button
          type="button"
          className="flex items-center gap-2 rounded px-3 h-8 w-full max-w-md hover:bg-white/10 transition-colors"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          {/* Spark icon */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5L8 1Z" fill="#F59E0B" />
          </svg>
          <span className="text-sm text-white/50 flex-1 text-left">Search or Ask a Question</span>
          <div className="flex items-center gap-0.5">
            <span className="text-[10px] text-white/40 bg-white/10 rounded px-1 py-0.5">Ctrl</span>
            <span className="text-[10px] text-white/40 bg-white/10 rounded px-1 py-0.5">K</span>
          </div>
        </button>
      </div>

      {/* Right: Apps + icons + avatar + company */}
      <div className="flex items-center gap-3">
        <button type="button" className="flex flex-col items-start hover:bg-white/10 rounded px-2 py-0.5 transition-colors">
          <span className="text-[10px] text-white/50 leading-none">Apps</span>
          <div className="flex items-center gap-1">
            <span className="text-sm text-white font-medium">Select an App</span>
            <ChevronDown size={12} className="text-white/60" />
          </div>
        </button>

        <div className="flex items-center gap-1">
          <button type="button" className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-white/70">
            <HelpCircle size={18} />
          </button>
          <button type="button" className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-white/70">
            <MessageSquare size={18} />
          </button>
          <button type="button" className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-white/70">
            <Bell size={18} />
          </button>
        </div>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shrink-0" />

        {/* Company badge */}
        <div
          className="flex items-center gap-1.5 rounded px-2 py-1"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          <div className="w-5 h-5 rounded bg-orange-500 flex items-center justify-center shrink-0">
            <span className="text-[8px] text-white font-bold">V</span>
          </div>
          <span className="text-xs text-white font-medium">Vertigo</span>
        </div>
      </div>
    </div>
  );
}

function EmptyStateIllustration() {
  return (
    <svg width="200" height="160" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Back window — blue */}
      <rect x="52" y="20" width="116" height="88" rx="4" fill="#2066DF" />
      <rect x="52" y="20" width="116" height="14" rx="4" fill="#1A54B8" />
      <circle cx="64" cy="27" r="2.5" fill="#5B8FE8" />
      <circle cx="73" cy="27" r="2.5" fill="#5B8FE8" />
      <circle cx="82" cy="27" r="2.5" fill="#5B8FE8" />

      {/* Mid window — light gray shadow */}
      <rect x="44" y="30" width="116" height="88" rx="4" fill="#C8CDD0" />

      {/* Front window — white */}
      <rect x="36" y="40" width="116" height="88" rx="4" fill="white" stroke="#D1D5DB" strokeWidth="1" />
      {/* Window title bar */}
      <rect x="36" y="40" width="116" height="14" rx="4" fill="#F3F4F6" />
      <rect x="36" y="47" width="116" height="7" fill="#F3F4F6" />
      <circle cx="48" cy="47" r="2.5" fill="#D1D5DB" />
      <circle cx="57" cy="47" r="2.5" fill="#D1D5DB" />
      <circle cx="66" cy="47" r="2.5" fill="#D1D5DB" />
      {/* Content lines */}
      <rect x="46" y="64" width="64" height="6" rx="2" fill="#E5E7EB" />
      <rect x="46" y="76" width="84" height="6" rx="2" fill="#E5E7EB" />
      <rect x="46" y="88" width="74" height="6" rx="2" fill="#E5E7EB" />
      <rect x="46" y="100" width="54" height="6" rx="2" fill="#E5E7EB" />

      {/* Orange plus symbol */}
      <rect x="22" y="98" width="36" height="8" rx="4" fill="#F26522" />
      <rect x="38" y="82" width="8" height="36" rx="4" fill="#F26522" />
    </svg>
  );
}

export function ModelManagerPage() {
  const handleCreate = () => {
    window.location.href = '/?model=condos';
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#F5F6F7]">
      <SiteHeader />
      {/* Page header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-[#E3E6E8] shrink-0">
        <button
          type="button"
          className="flex items-center justify-center"
          style={{ borderRadius: 4, backgroundColor: '#E3E6E8', padding: 6 }}
        >
          <img src={cogIcon} alt="" width={24} height={24} />
        </button>
        <span style={{ fontFamily: 'Inter', fontSize: 24, fontWeight: 700, lineHeight: '32px', letterSpacing: '0.15px', color: '#111827' }}>Model Manager</span>
      </div>

      {/* Empty state */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <EmptyStateIllustration />

        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-xl font-bold text-[#111827] leading-snug">
            Create Project Model<br />to Get Started
          </h1>
          <p className="text-sm text-[#6A767C] max-w-xs leading-relaxed">
            Create a project model from the BIM files in<br />
            Procore to share with the team.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCreate}
          className="flex items-center gap-2 px-5 py-2.5 rounded text-white text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#F26522' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#D9541A')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#F26522')}
        >
          <span className="text-base leading-none">+</span>
          Create Project Model
        </button>
      </div>
    </div>
  );
}
