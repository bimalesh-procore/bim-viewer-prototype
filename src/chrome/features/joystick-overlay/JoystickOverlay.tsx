function JoystickCircle({ size = 102 }: { size?: number }) {
  return (
    <div
      className="relative rounded-[24px] border-4 border-[rgba(215,214,214,0.2)] shadow-[0px_0px_3.85px_rgba(0,0,0,0.2)] bg-[rgba(255,255,255,0.25)] backdrop-blur-[2px]"
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-1 rounded-[20px] bg-[rgba(255,255,255,0.55)]" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 border border-[#d6dadc]" />
    </div>
  );
}

export function JoystickOverlay() {
  return (
    <div className="pointer-events-none absolute left-3 right-3 bottom-[108px] z-10 flex items-end justify-between">
      <div className="flex items-end gap-3">
        <JoystickCircle size={102} />
        <div className="h-[103px] w-[64px] rounded-[20px] border-4 border-[rgba(215,214,214,0.2)] shadow-[0px_0px_3.85px_rgba(0,0,0,0.2)] bg-[rgba(255,255,255,0.25)] backdrop-blur-[2px]">
          <div className="h-full w-full rounded-[16px] bg-[rgba(255,255,255,0.55)]" />
        </div>
      </div>

      <div className="w-[38px] h-[38px] rounded-[11px] bg-[#f4f0f0] shadow-[0px_2px_3px_rgba(0,0,0,0.3)]" />

      <JoystickCircle size={102} />
    </div>
  );
}
