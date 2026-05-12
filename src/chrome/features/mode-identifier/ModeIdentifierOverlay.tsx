import { useEffect, useRef, useState } from 'react';
import caretDownIcon from '../../assets/icons/mode-identifier/caret-down.svg';
import sectionCutVideo from '../../assets/Video/section cut demo.mov';
import sectionPlaneVideo from '../../assets/Video/section plane video.mov';

type ModeIdentifierMode = 'default' | 'markup' | 'measure' | 'create' | 'sectioning';

interface ModeIdentifierDetail {
  mode: ModeIdentifierMode;
  label: string;
  subTool?: string | null;
}

const videoBySubTool: Partial<Record<string, string>> = {
  'section-cut': sectionCutVideo,
  'section-plane': sectionPlaneVideo,
};

export function ModeIdentifierOverlay() {
  const [modeState, setModeState] = useState<ModeIdentifierDetail>({
    mode: 'default',
    label: '',
    subTool: null,
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [visible, setVisible] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const seenLabels = useRef<Set<string>>(new Set());
  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manuallyExpanded = useRef(false);

  const modeDescriptionByMode: Record<ModeIdentifierMode, string> = {
    default: '',
    markup: 'Markup mode lets you annotate the selected saved view with drawing and text tools.',
    measure: 'Measure mode lets you take precise measurements directly on the model.',
    create: 'Create mode lets you add and organize saved views for the current model position.',
    sectioning: 'Sectioning mode lets you cut through the model to inspect interior geometry.',
  };

  const labelDescriptionOverrides: Record<string, { description: string; shortcuts: { key: string; label: string }[] }> = {
    'Sectioning: Cut': {
      description: 'Click any surface to slice through the model at that point. Drag the green plane to adjust the cut depth.',
      shortcuts: [
        { key: 'R', label: 'Rotate cut 45°' },
        { key: 'Delete', label: 'Delete plane' },
        { key: 'Enter', label: 'Save plane' },
      ],
    },
    'Sectioning: Plane': {
      description: 'Click any surface to place a clipping plane along it. Drag the green plane to push it through the model.',
      shortcuts: [
        { key: 'F', label: 'Flip plane' },
        { key: 'Delete', label: 'Delete plane' },
        { key: 'Enter', label: 'Save plane' },
      ],
    },
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ModeIdentifierDetail>).detail;
      if (!detail) return;
      setModeState(detail);
      const firstVisit = !seenLabels.current.has(detail.label);
      seenLabels.current.add(detail.label);
      setLightboxOpen(false);

      // Clear any existing timers
      if (autoCollapseTimer.current) {
        clearTimeout(autoCollapseTimer.current);
        autoCollapseTimer.current = null;
      }
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }

      manuallyExpanded.current = false;
      setVisible(true);

      if (firstVisit) {
        setIsExpanded(true);
        // Auto-collapse after 1.5 s unless the user manually opened it
        autoCollapseTimer.current = setTimeout(() => {
          if (!manuallyExpanded.current) {
            setIsExpanded(false);
          }
          autoCollapseTimer.current = null;
        }, 1500);
      } else {
        setIsExpanded(false);
      }

      // Hide entirely after 2 s unless the user has manually interacted
      hideTimer.current = setTimeout(() => {
        if (!manuallyExpanded.current) {
          setVisible(false);
        }
        hideTimer.current = null;
      }, 2000);
    };
    window.addEventListener('mv:mode-identifier', handler);
    return () => {
      window.removeEventListener('mv:mode-identifier', handler);
      if (autoCollapseTimer.current) clearTimeout(autoCollapseTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen]);

  useEffect(() => {
    if (lightboxOpen) {
      videoRef.current?.play();
    } else {
      const v = videoRef.current;
      if (v) { v.pause(); v.currentTime = 0; }
    }
  }, [lightboxOpen]);

  if (modeState.mode === 'default') return null;

  const videoSrc = modeState.subTool ? videoBySubTool[modeState.subTool] : undefined;

  return (
    <>
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-[240] pointer-events-auto transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none' }}
      >
        <div
          className={`p-1 rounded-[8px] border border-[#3b4044] bg-[#171a1c] text-white shadow-[0px_4px_20px_rgba(0,0,0,0.35)]${
            isExpanded ? ' w-[350px]' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Mode identifier toggle"
              aria-expanded={isExpanded}
              onClick={() => {
                // Mark as manually controlled — cancel both auto-collapse and hide timers
                manuallyExpanded.current = true;
                if (autoCollapseTimer.current) {
                  clearTimeout(autoCollapseTimer.current);
                  autoCollapseTimer.current = null;
                }
                if (hideTimer.current) {
                  clearTimeout(hideTimer.current);
                  hideTimer.current = null;
                }
                setIsExpanded((prev) => !prev);
              }}
              className="w-6 h-6 rounded-[6px] bg-[#3E3E3E] hover:bg-[#4A4A4A] transition-colors flex items-center justify-center shrink-0"
            >
              <img
                src={caretDownIcon}
                alt=""
                width={16}
                height={16}
                className={`block transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              />
            </button>
            <div className="text-[12px] leading-4 font-semibold whitespace-nowrap">
              {modeState.label}
            </div>
          </div>

          {isExpanded && (
            <div className="pb-1 pt-1 flex items-start gap-3" style={{ paddingLeft: '36px', paddingRight: '4px' }}>
              <div className="flex-1 flex flex-col gap-3">
                <p className="text-[12px] leading-4 text-[#c5c9cd]">
                  {labelDescriptionOverrides[modeState.label]?.description
                    ?? modeDescriptionByMode[modeState.mode]}
                </p>
                {labelDescriptionOverrides[modeState.label]?.shortcuts && (
                  <div className="grid gap-x-2 gap-y-[3px]" style={{ gridTemplateColumns: 'max-content max-content' }}>
                    {labelDescriptionOverrides[modeState.label].shortcuts.map(({ key, label }) => (
                      <>
                        <span key={`${key}-label`} className="text-[11px] text-[#8b9196] leading-4">{label}</span>
                        <span key={`${key}-chip`} className="text-[10px] font-mono font-semibold bg-[#2e3336] text-[#c5c9cd] px-[6px] py-[1px] rounded-[4px] border border-[#3b4044] leading-4 text-center">
                          {key}
                        </span>
                      </>
                    ))}
                  </div>
                )}
              </div>
              {videoSrc && (
                <button
                  type="button"
                  aria-label="Play demo video"
                  onClick={() => setLightboxOpen(true)}
                  className="relative shrink-0 w-[80px] h-[52px] rounded-[6px] overflow-hidden border border-[#3b4044] hover:border-[#6b7280] transition-colors group"
                >
                  <video
                    src={videoSrc}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                  {/* Play icon overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/50 transition-colors">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="10" fill="rgba(0,0,0,0.5)" />
                      <polygon points="8,6 15,10 8,14" fill="white" />
                    </svg>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Video lightbox */}
      {lightboxOpen && videoSrc && (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center pointer-events-auto"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="relative"
            style={{ height: '800px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              playsInline
              style={{ height: '800px', width: 'auto', borderRadius: '8px', display: 'block' }}
            />
            <button
              type="button"
              aria-label="Close video"
              onClick={() => setLightboxOpen(false)}
              className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-[#3E3E3E] hover:bg-[#555] text-white flex items-center justify-center text-sm transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
