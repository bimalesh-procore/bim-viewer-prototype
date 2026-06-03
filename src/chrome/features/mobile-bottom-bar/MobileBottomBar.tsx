import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useViewerAdapter } from '../viewer-adapter/ViewerAdapterContext';
import generalIcon from '../../assets/icons/left-toolbar/views-markups.svg';
import toolsIcon from '../../assets/icons/right-toolbar/quick-create.svg';
import viewsIcon from '../../assets/icons/left-toolbar/views-markups.svg';
import itemsIcon from '../../assets/icons/left-toolbar/items.svg';
import objectsIcon from '../../assets/icons/left-toolbar/object-tree.svg';
import propertiesIcon from '../../assets/icons/left-toolbar/properties.svg';
import groupsIcon from '../../assets/icons/left-toolbar/search-sets.svg';
import deviationsIcon from '../../assets/icons/left-toolbar/deviation.svg';
import orthoIcon from '../../assets/icons/right-toolbar/orthographic.svg';
import renderIcon from '../../assets/icons/right-toolbar/render-modes.svg';
import xrayIcon from '../../assets/icons/right-toolbar/x-ray.svg';
import markupIcon from '../../assets/icons/right-toolbar/markup.svg';
import createIcon from '../../assets/icons/right-toolbar/quick-create.svg';
import measureIcon from '../../assets/icons/right-toolbar/measure.svg';
import sectionIcon from '../../assets/icons/right-toolbar/sectioning.svg';
import saveIcon from '../../assets/icons/right-toolbar/save.svg';
import exitIcon from '../../assets/icons/right-toolbar/exit.svg';
import sectionPlaneIcon from '../../assets/icons/right-toolbar/section-plane.svg';
import sectionBoxIcon from '../../assets/icons/right-toolbar/section-box.svg';
import sectionCutIcon from '../../assets/icons/right-toolbar/section-cut.svg';
import sectionBoxMoveIcon from '../../assets/icons/right-toolbar/section-box-move.svg';
import sectionBoxDragFaceIcon from '../../assets/icons/right-toolbar/section-box-drag-face.svg';
import sectionBoxRotateIcon from '../../assets/icons/right-toolbar/section-box-rotate.svg';
import measureDimensionsIcon from '../../assets/icons/right-toolbar/measure-distance.svg';
import measurePointIcon from '../../assets/icons/right-toolbar/measure-point.svg';
import measureLaserIcon from '../../assets/icons/right-toolbar/measure-angle.svg';
import measureManholeIcon from '../../assets/icons/right-toolbar/measure-area.svg';
import measureCoordinatesIcon from '../../assets/icons/right-toolbar/measure-height.svg';
import markupSelectIcon from '../../assets/icons/right-toolbar/markup-select.svg';
import markupTextIcon from '../../assets/icons/right-toolbar/markup-text.svg';
import markupLineIcon from '../../assets/icons/right-toolbar/markup-line.svg';
import markupShapeIcon from '../../assets/icons/right-toolbar/markup-rect.svg';
import markupFreehandIcon from '../../assets/icons/right-toolbar/markup-freehand.svg';
import markupCalloutIcon from '../../assets/icons/right-toolbar/markup-callout.svg';
import markupHighlighterIcon from '../../assets/icons/right-toolbar/markup-highlighter.svg';
import resetIcon from '../../assets/icons/right-toolbar/reset.svg';
import undoIcon from '../../assets/icons/right-toolbar/undo.svg';
import redoIcon from '../../assets/icons/right-toolbar/redo.svg';

type ToolbarMode = 'general' | 'tools';
type DetailMode = 'none' | 'section' | 'measure' | 'markup';

interface ToolbarItem {
  id: string;
  label: string;
  icon: string | ReactNode;
}

function MobileBottomBarButton({
  icon,
  label,
  onClick,
  className = '',
  labelClassName = '',
  iconClassName = '',
  selected = false,
  selectedClassName = 'text-[#171a1c]',
  defaultClassName = 'text-[#171a1c]',
  iconTileClassName = 'bg-transparent',
  selectedIconTileClassName = 'bg-[#eef0f1]',
  tintIconOnSelected = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
  labelClassName?: string;
  iconClassName?: string;
  selected?: boolean;
  selectedClassName?: string;
  defaultClassName?: string;
  iconTileClassName?: string;
  selectedIconTileClassName?: string;
  tintIconOnSelected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-[64px] h-[64px] relative transition-colors ${className}`}
    >
      <span
        className={`absolute top-[2px] left-1/2 -translate-x-1/2 h-[40px] w-[40px] rounded-[8px] inline-flex items-center justify-center ${
          selected ? selectedIconTileClassName : iconTileClassName
        }`}
      >
        <span
          className={`inline-flex items-center justify-center ${iconClassName}`}
          style={selected && tintIconOnSelected
            ? { filter: 'invert(28%) sepia(95%) saturate(1582%) hue-rotate(205deg) brightness(88%) contrast(96%)' }
            : undefined}
        >
          {icon}
        </span>
      </span>
      <span
        className={`text-[12px] leading-[16px] truncate max-w-full px-0.5 absolute bottom-[2px] left-1/2 -translate-x-1/2 ${
          selected ? selectedClassName : defaultClassName
        } ${labelClassName}`}
      >
        {label}
      </span>
    </button>
  );
}

function IconNode({ icon }: { icon: string | ReactNode }) {
  if (typeof icon === 'string') {
    return <img src={icon} alt="" width={22} height={22} className="block" />;
  }
  return <>{icon}</>;
}

function ToolbarRow({
  items,
  activeId,
  onSelect,
  selectedClassName = 'text-[#1d5cc9]',
  defaultClassName = 'bg-white text-[#171a1c]',
  selectedIconTileClassName = 'bg-[#e4ecfb]',
  tintIconOnSelected = true,
}: {
  items: ToolbarItem[];
  activeId: string | null;
  onSelect: (item: ToolbarItem) => void;
  selectedClassName?: string;
  defaultClassName?: string;
  selectedIconTileClassName?: string;
  tintIconOnSelected?: boolean;
}) {
  return (
    <div className="pointer-events-auto h-[72px] rounded-[8px] bg-white p-1 flex items-center gap-[2px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08),0px_8px_16px_0px_rgba(23,26,28,0.24)] overflow-x-auto">
      {items.map((item) => (
        <MobileBottomBarButton
          key={item.id}
          icon={<IconNode icon={item.icon} />}
          iconClassName="h-[22px] w-[22px]"
          label={item.label}
          selected={activeId === item.id}
          selectedClassName={selectedClassName}
          defaultClassName={defaultClassName}
          selectedIconTileClassName={selectedIconTileClassName}
          tintIconOnSelected={tintIconOnSelected}
          onClick={() => onSelect(item)}
        />
      ))}
    </div>
  );
}

export function MobileBottomBar() {
  const adapter = useViewerAdapter();
  const [mode, setMode] = useState<ToolbarMode>('general');
  const [detailMode, setDetailMode] = useState<DetailMode>('none');
  const [activeGeneralId, setActiveGeneralId] = useState<string>('objects');
  const [activeToolsId, setActiveToolsId] = useState<string | null>(null);
  const [activeDetailId, setActiveDetailId] = useState<string | null>(null);
  const [activeSectionBoxSubTool, setActiveSectionBoxSubTool] = useState<'move' | 'drag-face' | 'rotate'>('move');

  const generalItems: ToolbarItem[] = [
    { id: 'views', label: 'Views', icon: viewsIcon },
    { id: 'items', label: 'Items', icon: itemsIcon },
    { id: 'objects', label: 'Objects', icon: objectsIcon },
    { id: 'properties', label: 'Properties', icon: propertiesIcon },
    { id: 'groups', label: 'Groups', icon: groupsIcon },
    { id: 'deviations', label: 'Deviations', icon: deviationsIcon },
  ];

  const toolsItems: ToolbarItem[] = [
    { id: 'ortho', label: 'Ortho', icon: orthoIcon },
    { id: 'render', label: 'Render', icon: renderIcon },
    { id: 'xray', label: 'X-Ray', icon: xrayIcon },
    { id: 'markup', label: 'Markup', icon: markupIcon },
    { id: 'create', label: 'Create', icon: createIcon },
    { id: 'measure', label: 'Measure', icon: measureIcon },
    { id: 'section', label: 'Section', icon: sectionIcon },
  ];

  const detailItems = useMemo<Record<Exclude<DetailMode, 'none'>, ToolbarItem[]>>(
    () => ({
      section: [
        { id: 'section-plane', label: 'Plane', icon: sectionPlaneIcon },
        { id: 'section-box', label: 'Box', icon: sectionBoxIcon },
        { id: 'section-cut', label: 'Cut', icon: sectionCutIcon },
      ],
      measure: [
        { id: 'dimensions', label: 'Dimensions', icon: measureDimensionsIcon },
        { id: 'point', label: 'Point', icon: measurePointIcon },
        { id: 'laser', label: 'Laser', icon: measureLaserIcon },
        { id: 'manhole', label: 'Manhole', icon: measureManholeIcon },
        { id: 'coordinates', label: 'Coordinates', icon: measureCoordinatesIcon },
      ],
      markup: [
        { id: 'select', label: 'Select', icon: markupSelectIcon },
        { id: 'text', label: 'Text', icon: markupTextIcon },
        { id: 'line', label: 'Line', icon: markupLineIcon },
        { id: 'shape', label: 'Shape', icon: markupShapeIcon },
        { id: 'freehand', label: 'Freehand', icon: markupFreehandIcon },
        { id: 'callout', label: 'Callout', icon: markupCalloutIcon },
        { id: 'highlighter', label: 'Highlighter', icon: markupHighlighterIcon },
      ],
    }),
    [],
  );

  const sectionBoxSubTools: ToolbarItem[] = [
    { id: 'move', label: 'Move', icon: sectionBoxMoveIcon },
    { id: 'drag-face', label: 'Drag face', icon: sectionBoxDragFaceIcon },
    { id: 'rotate', label: 'Rotate', icon: sectionBoxRotateIcon },
  ];

  const selectGeneral = (item: ToolbarItem) => {
    setActiveGeneralId(item.id);
    const panelMap: Record<string, { panelId: string; label: string }> = {
      views: { panelId: 'views', label: 'Viewpoints' },
      items: { panelId: 'items', label: 'Items' },
      objects: { panelId: 'object-tree', label: 'Object Tree' },
      properties: { panelId: 'properties', label: 'Properties' },
      groups: { panelId: 'search-sets', label: 'Search Sets' },
      deviations: { panelId: 'deviation', label: 'Deviation' },
    };
    const panel = panelMap[item.id];
    if (panel) {
      window.dispatchEvent(new CustomEvent('mv:open-panel', { detail: panel }));
    }
  };

  const selectTool = (item: ToolbarItem) => {
    setActiveToolsId(item.id);
    window.dispatchEvent(new CustomEvent('mv:close-mobile-panel'));
    if (item.id === 'ortho') {
      adapter.toggleOrthographic?.();
      return;
    }
    if (item.id === 'render') {
      adapter.setRenderStyle?.('realism');
      return;
    }
    if (item.id === 'xray') {
      adapter.toggleXRay?.();
      return;
    }
    if (item.id === 'markup' || item.id === 'measure' || item.id === 'section') {
      setDetailMode(item.id as DetailMode);
      setActiveDetailId(item.id === 'section' ? 'section-plane' : null);
      if (item.id === 'measure') adapter.toggleMeasureTool?.();
      if (item.id === 'section') {
        adapter.setActiveSectioningTool?.('section-plane');
        setActiveSectionBoxSubTool('move');
      }
      return;
    }
    if (item.id === 'create') {
      console.log('Mobile Create tapped.');
    }
  };

  const saveAndExitDetail = (save: boolean) => {
    if (detailMode === 'section' && save) adapter.commitActiveCut?.();
    if (detailMode === 'section') adapter.setActiveSectioningTool?.(null);
    setDetailMode('none');
    setActiveDetailId(null);
  };

  const selectDetail = (item: ToolbarItem) => {
    setActiveDetailId(item.id);
    if (detailMode === 'section') {
      if (item.id === 'section-plane') {
        adapter.setActiveSectioningTool?.('section-plane');
        return;
      }
      if (item.id === 'section-box') {
        adapter.setActiveSectioningTool?.('section-box');
        setActiveSectionBoxSubTool('move');
        adapter.setSectionBoxSubTool?.('move');
        return;
      }
      if (item.id === 'section-cut') {
        adapter.setActiveSectioningTool?.('section-cut');
        return;
      }
      return;
    }
    if (detailMode === 'measure') {
      adapter.toggleMeasureTool?.();
      return;
    }
    if (detailMode === 'markup') {
      console.log(`Markup tool selected: ${item.id}`);
    }
  };

  const selectSectionBoxSubTool = (item: ToolbarItem) => {
    const tool = item.id as 'move' | 'drag-face' | 'rotate';
    setActiveSectionBoxSubTool(tool);
    adapter.setSectionBoxSubTool?.(tool);
  };

  return (
    <div className="absolute left-3 right-3 bottom-4 z-20 flex items-end justify-between pointer-events-none">
      <div className="flex items-end gap-[2px] min-w-0 max-w-[calc(100%-185px)]">
        <div className="pointer-events-auto h-[72px] rounded-[8px] bg-white p-1 flex items-center gap-[2px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08),0px_8px_16px_0px_rgba(23,26,28,0.24)]">
          <MobileBottomBarButton
            icon={
              <img
                src={generalIcon}
                alt=""
                width={22}
                height={22}
                className="block"
              />
            }
            iconClassName="h-[22px] w-[22px]"
            label="General"
            selected={mode === 'general'}
            selectedClassName="text-[#171a1c]"
            defaultClassName="bg-white text-[#171a1c]"
            selectedIconTileClassName="bg-[#eef0f1]"
            iconTileClassName="bg-transparent"
            tintIconOnSelected={false}
            onClick={() => {
              setMode('general');
              setDetailMode('none');
              window.dispatchEvent(new CustomEvent('mv:close-mobile-panel'));
            }}
          />
          <MobileBottomBarButton
            icon={
              <img
                src={toolsIcon}
                alt=""
                width={22}
                height={22}
                className="block"
              />
            }
            iconClassName="h-[22px] w-[22px]"
            label="Tools"
            selected={mode === 'tools'}
            selectedClassName="text-[#171a1c]"
            defaultClassName="bg-white text-[#171a1c]"
            selectedIconTileClassName="bg-[#eef0f1]"
            iconTileClassName="bg-transparent"
            tintIconOnSelected={false}
            onClick={() => {
              setMode('tools');
              setDetailMode('none');
              window.dispatchEvent(new CustomEvent('mv:close-mobile-panel'));
            }}
          />
        </div>

        {mode === 'general' && detailMode === 'none' && (
          <ToolbarRow
            items={generalItems}
            activeId={activeGeneralId}
            onSelect={selectGeneral}
            selectedClassName="text-[#1d5cc9]"
            selectedIconTileClassName="bg-[#e4ecfb]"
          />
        )}

        {mode === 'tools' && detailMode === 'none' && (
          <ToolbarRow
            items={toolsItems}
            activeId={activeToolsId}
            onSelect={selectTool}
            selectedClassName="text-[#1d5cc9]"
            selectedIconTileClassName="bg-[#e4ecfb]"
          />
        )}

        {detailMode !== 'none' && (
          <>
            <div className="pointer-events-auto h-[72px] rounded-[8px] bg-white p-1 flex items-center gap-[2px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08),0px_8px_16px_0px_rgba(23,26,28,0.24)]">
              <MobileBottomBarButton
                icon={<img src={saveIcon} alt="" width={22} height={22} className="block" />}
                iconClassName="h-[22px] w-[22px]"
                label="Save"
                className="text-[#171a1c]"
                selectedClassName="bg-[#e7f8e7] text-[#171a1c]"
                defaultClassName="bg-white text-[#171a1c]"
                iconTileClassName="bg-[#ECFCEB]"
                onClick={() => saveAndExitDetail(true)}
              />
              <MobileBottomBarButton
                icon={
                  <img
                    src={exitIcon}
                    alt=""
                    width={22}
                    height={22}
                    className="block"
                    style={{ filter: 'invert(19%) sepia(89%) saturate(2898%) hue-rotate(344deg) brightness(94%) contrast(94%)' }}
                  />
                }
                iconClassName="h-[22px] w-[22px]"
                label="Exit"
                selectedClassName="bg-[#fbe9e9] text-[#171a1c]"
                defaultClassName="bg-white text-[#171a1c]"
                iconTileClassName="bg-[#FDECEC]"
                onClick={() => saveAndExitDetail(false)}
              />
            </div>
            <ToolbarRow
              items={detailItems[detailMode]}
              activeId={activeDetailId}
              onSelect={selectDetail}
              selectedClassName="text-[#1d5cc9]"
              selectedIconTileClassName="bg-[#e4ecfb]"
            />
            {detailMode === 'section' && activeDetailId === 'section-box' && (
              <ToolbarRow
                items={sectionBoxSubTools}
                activeId={activeSectionBoxSubTool}
                onSelect={selectSectionBoxSubTool}
                selectedClassName="text-[#1d5cc9]"
                selectedIconTileClassName="bg-[#e4ecfb]"
              />
            )}
          </>
        )}
      </div>

      <div className="pointer-events-auto flex items-end gap-1">
        <MobileBottomBarButton
          icon={<img src={resetIcon} alt="" width={22} height={22} className="block" />}
          label="Reset"
          className="w-[64px] h-[64px] rounded-[6px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)]"
          iconClassName="h-[22px] w-[22px]"
          onClick={() => adapter.resetView()}
        />
        <MobileBottomBarButton
          icon={<img src={undoIcon} alt="" width={22} height={22} className="block" />}
          label="Undo"
          className="w-[64px] h-[64px] rounded-[6px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)]"
          iconClassName="h-[22px] w-[22px]"
          onClick={() => adapter.undo?.()}
        />
        <MobileBottomBarButton
          icon={<img src={redoIcon} alt="" width={22} height={22} className="block" />}
          label="Redo"
          className="w-[64px] h-[64px] rounded-[6px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.08)]"
          iconClassName="h-[22px] w-[22px]"
          onClick={() => adapter.redo?.()}
        />
      </div>
    </div>
  );
}
