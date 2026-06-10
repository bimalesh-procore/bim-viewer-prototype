import cogIcon from '../../assets/icons/model-manager/cog.svg';
import procoreLogoText from '../../assets/icons/model-manager/nav/procore-logo-text.svg';
import procoreLogoHex from '../../assets/icons/model-manager/nav/procore-logo-hex.svg';
import menuIcon from '../../assets/icons/model-manager/nav/menu.svg';
import caretDownIcon from '../../assets/icons/model-manager/nav/caret-down.svg';
import copilotIcon from '../../assets/icons/model-manager/nav/copilot.svg';
import helpIcon from '../../assets/icons/model-manager/nav/help.svg';
import commentsIcon from '../../assets/icons/model-manager/nav/comments.svg';
import bellIcon from '../../assets/icons/model-manager/nav/bell.svg';
import projectThumb from '../../assets/icons/model-manager/nav/project-thumb.png';
import avatarImg from '../../assets/icons/model-manager/nav/avatar.png';
import companyLogo from '../../assets/icons/model-manager/nav/company-logo.png';

// Procore design tokens (dark / "reversed" global nav surface)
const COLOR_INPUT_REVERSED = '#464F53';
const COLOR_TEXT_REVERSED_TERTIARY = '#D6DADC';
const COLOR_TEXT_SECONDARY = '#6A767C';
const COLOR_BG_TERTIARY = '#EEF0F1';
const COLOR_TEXT_PRIMARY = '#232729';

// Icons are authored at their natural glyph size, centered inside a 24px frame
// (preserveAspectRatio="none"), so render each at intrinsic dimensions to avoid stretching.
function NavIcon({ src, w, h, alt = '' }: { src: string; w: number; h: number; alt?: string }) {
  return (
    <span className="flex items-center justify-center size-6 shrink-0">
      <img src={src} alt={alt} style={{ width: w, height: h }} className="block max-w-none" />
    </span>
  );
}

function SiteHeader() {
  return (
    <div className="flex flex-col items-start shrink-0 w-full bg-black p-2">
      <div className="flex items-center justify-between w-full">
        {/* Left: Menu + Procore logo + project switcher */}
        <div className="flex items-center gap-3 pr-1">
          <div className="flex items-center gap-1 pr-1">
            <button
              type="button"
              className="flex h-10 items-center justify-center p-1.5 rounded-md hover:bg-white/10 transition-colors"
            >
              <NavIcon src={menuIcon} w={18} h={14} alt="Menu" />
              <span className="flex px-1.5 py-0.5">
                <span className="font-semibold text-sm leading-5 tracking-[0.15px] text-white whitespace-nowrap">Menu</span>
              </span>
            </button>

            <div className="flex h-10 flex-col items-center justify-center p-2 rounded-md">
              <div className="relative" style={{ width: 106, height: 14 }}>
                <img src={procoreLogoText} alt="Procore" className="absolute inset-0 size-full" />
                <img
                  src={procoreLogoHex}
                  alt=""
                  className="absolute"
                  style={{ left: 50.68, top: 4.69, width: 5.11, height: 4.61 }}
                />
              </div>
            </div>
          </div>

          <button type="button" className="flex items-start hover:opacity-90 transition-opacity">
            <div
              className="flex items-center gap-1 p-0.5 rounded-md"
              style={{ backgroundColor: COLOR_INPUT_REVERSED }}
            >
              <div className="size-9 rounded overflow-hidden shrink-0">
                <img src={projectThumb} alt="" className="size-full object-cover" />
              </div>
              <div className="flex flex-col items-start pl-0.5 text-left whitespace-nowrap">
                <span className="font-normal text-xs leading-4 tracking-[0.25px]" style={{ color: COLOR_TEXT_REVERSED_TERTIARY }}>
                  Vertigo Construction
                </span>
                <span className="font-semibold text-sm leading-5 tracking-[0.15px] text-white">
                  Seattle Corridor Railway
                </span>
              </div>
              <NavIcon src={caretDownIcon} w={10} h={5} />
            </div>
          </button>
        </div>

        {/* Center: Helix search */}
        <button
          type="button"
          className="flex items-center gap-5 min-w-[325px] max-w-[374px] w-[325px] p-2 rounded-md bg-white overflow-hidden"
        >
          <div className="flex flex-1 items-center gap-0.5 min-w-0">
            <NavIcon src={copilotIcon} w={20} h={20} />
            <span
              className="flex-1 min-w-0 text-left truncate font-normal text-sm leading-5 tracking-[0.15px]"
              style={{ color: COLOR_TEXT_SECONDARY }}
            >
              Search or Ask a Question
            </span>
          </div>
          <div className="flex items-center justify-end gap-0.5 shrink-0">
            <span className="flex items-center px-1.5 rounded-sm" style={{ backgroundColor: COLOR_BG_TERTIARY }}>
              <span className="text-[10px] leading-4 tracking-[0.4px]" style={{ color: COLOR_TEXT_PRIMARY }}>Ctrl</span>
            </span>
            <span className="flex items-center px-1.5 rounded-sm" style={{ backgroundColor: COLOR_BG_TERTIARY }}>
              <span className="text-[10px] leading-4 tracking-[0.4px]" style={{ color: COLOR_TEXT_PRIMARY }}>K</span>
            </span>
          </div>
        </button>

        {/* Right: Apps + icons + avatar + company */}
        <div className="flex items-center gap-2">
          <button type="button" className="flex items-start hover:opacity-90 transition-opacity">
            <div
              className="flex items-center gap-1 pl-1.5 pr-0.5 py-0.5 rounded-md"
              style={{ backgroundColor: COLOR_INPUT_REVERSED }}
            >
              <div className="flex flex-col items-start pl-0.5 text-left whitespace-nowrap">
                <span className="font-normal text-xs leading-4 tracking-[0.25px]" style={{ color: COLOR_TEXT_REVERSED_TERTIARY }}>
                  Apps
                </span>
                <span className="font-semibold text-sm leading-5 tracking-[0.15px] text-white">
                  Select an App
                </span>
              </div>
              <NavIcon src={caretDownIcon} w={10} h={5} />
            </div>
          </button>

          <button type="button" className="flex items-center justify-center p-1.5 rounded size-10 hover:bg-white/10 transition-colors">
            <NavIcon src={helpIcon} w={21} h={21} alt="Help" />
          </button>
          <button type="button" className="flex items-center justify-center p-1.5 rounded size-10 hover:bg-white/10 transition-colors">
            <NavIcon src={commentsIcon} w={20} h={20} alt="Comments" />
          </button>
          <button type="button" className="flex items-center justify-center p-1.5 rounded size-10 hover:bg-white/10 transition-colors">
            <NavIcon src={bellIcon} w={17} h={20} alt="Notifications" />
          </button>

          <div className="flex items-center gap-2 max-w-[250px] max-h-10">
            <button type="button" className="flex shrink-0">
              <span className="block size-10 rounded-full overflow-hidden">
                <img src={avatarImg} alt="" className="size-full object-cover" />
              </span>
            </button>
            <button
              type="button"
              className="flex h-10 w-[92px] max-w-[108px] items-center justify-center rounded-md bg-white overflow-hidden"
            >
              <img src={companyLogo} alt="Vertigo" className="object-contain" style={{ width: 81.524, height: 23.012 }} />
            </button>
          </div>
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
