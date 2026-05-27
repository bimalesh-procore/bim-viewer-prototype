/**
 * ContextMenu - Right-click context menu component
 */

export class ContextMenu {
  constructor(container) {
    this.container = container;
    this.menu = null;
    this.isVisible = false;
    this.currentContext = null; // Stores intersection data

    this.eventListeners = new Map();

    this.boundOnClickOutside = this.onClickOutside.bind(this);
    this.boundOnKeyDown = this.onKeyDown.bind(this);

    this.init();
  }

  init() {
    this.createMenu();
  }

  createMenu() {
    this.menu = document.createElement('div');
    this.menu.className = 'mv-context-menu mv-hidden';
    this.menu.innerHTML = `
      <div class="mv-context-menu-header" data-role="title">
        [Object Name]
      </div>
      <div class="mv-context-menu-divider"></div>
      <div class="mv-context-menu-item" data-action="hideSelected">
        <span>Hide</span>
        <span class="mv-context-menu-chevron">›</span>
      </div>
      <div class="mv-context-menu-item" data-action="selectSimilar">
        <span>Select Similar</span>
      </div>
      <div class="mv-context-menu-item mv-context-menu-item--has-sub" data-action="isolate-parent">
        <span>Isolate</span>
        <span class="mv-context-menu-chevron">›</span>
        <div class="mv-context-submenu mv-hidden">
          <div class="mv-context-menu-item" data-action="isolateObject">
            <span>Isolate object</span>
          </div>
          <div class="mv-context-menu-item" data-action="isolateXray">
            <span>Isolate in X-Ray</span>
          </div>
          <div class="mv-context-menu-item" data-action="isolateInSectionBox">
            <span>Isolate in section box</span>
          </div>
        </div>
      </div>
      <div class="mv-context-menu-item" data-action="viewProperties">
        <span>View Properties</span>
      </div>
      <div class="mv-context-menu-item" data-action="zoomToSection">
        <span>Zoom to section</span>
      </div>
      <div class="mv-context-menu-item" data-action="addSectionPlane">
        <span>Add section plane</span>
      </div>
      <div class="mv-context-menu-item" data-action="linkExistingIssue">
        <span>Link to existing item</span>
      </div>
    `;

    this.container.appendChild(this.menu);
    this.setupEvents();
  }

  setupEvents() {
    // Submenu hover — show on parent enter, hide with delay on leave
    const parentItem = this.menu.querySelector('.mv-context-menu-item--has-sub');
    const submenu = parentItem?.querySelector('.mv-context-submenu');
    if (parentItem && submenu) {
      let hideTimer = null;
      const showSub = () => {
        clearTimeout(hideTimer);
        submenu.classList.remove('mv-hidden');
      };
      const hideSub = () => {
        hideTimer = setTimeout(() => submenu.classList.add('mv-hidden'), 120);
      };
      parentItem.addEventListener('mouseenter', showSub);
      parentItem.addEventListener('mouseleave', hideSub);
      submenu.addEventListener('mouseenter', showSub);
      submenu.addEventListener('mouseleave', hideSub);
    }

    // Clicks on all menu items (including inside submenu)
    this.menu.querySelectorAll('.mv-context-menu-item').forEach(item => {
      // The parent "Isolate" row itself should not fire an action on click
      if (item.dataset.action === 'isolate-parent') return;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        this.handleAction(action);
        this.hide();
      });
    });
  }

  handleAction(action) {
    this.emit(action, this.currentContext);
  }

  /**
   * Show context menu at position
   * @param {number} x - Screen X coordinate
   * @param {number} y - Screen Y coordinate
   * @param {Object} context - Intersection data (elementId, point, face, mesh)
   */
  show(x, y, context) {
    this.currentContext = context;
    this.menu.classList.remove('mv-hidden');
    this.isVisible = true;

    // Position menu
    const rect = this.container.getBoundingClientRect();
    const menuRect = this.menu.getBoundingClientRect();

    // Adjust position to keep menu within container
    let menuX = x - rect.left;
    let menuY = y - rect.top;

    // Check right boundary
    if (menuX + menuRect.width > rect.width) {
      menuX = rect.width - menuRect.width - 10;
    }

    // Check bottom boundary
    if (menuY + menuRect.height > rect.height) {
      menuY = rect.height - menuRect.height - 10;
    }

    this.menu.style.left = `${menuX}px`;
    this.menu.style.top = `${menuY}px`;

    // Update menu items based on context
    this.updateMenuItems(context);

    // Add global listeners
    setTimeout(() => {
      document.addEventListener('click', this.boundOnClickOutside);
      document.addEventListener('keydown', this.boundOnKeyDown);
    }, 0);
  }

  hide() {
    this.menu.classList.add('mv-hidden');
    this.isVisible = false;
    this.currentContext = null;

    // Remove global listeners
    document.removeEventListener('click', this.boundOnClickOutside);
    document.removeEventListener('keydown', this.boundOnKeyDown);
  }

  updateMenuItems(context) {
    // Enable/disable items based on context
    const title = this.menu.querySelector('[data-role="title"]');
    const sectionPlaneItem = this.menu.querySelector('[data-action="addSectionPlane"]');
    const hideItem = this.menu.querySelector('[data-action="hideSelected"]');
    const similarItem = this.menu.querySelector('[data-action="selectSimilar"]');
    const isolateParent   = this.menu.querySelector('[data-action="isolate-parent"]');
    const isolateObject   = this.menu.querySelector('[data-action="isolateObject"]');
    const isolateXray     = this.menu.querySelector('[data-action="isolateXray"]');
    const isolateSection  = this.menu.querySelector('[data-action="isolateInSectionBox"]');
    const propsItem = this.menu.querySelector('[data-action="viewProperties"]');

    if (title) {
      const objectLabel =
        context?.mesh?.userData?.name
        || context?.mesh?.name
        || context?.elementId
        || 'Object Name';
      title.textContent = `[${objectLabel}]`;
    }

    // Section plane requires a face to be clicked
    if (sectionPlaneItem) {
      const hasFace = context && context.face;
      sectionPlaneItem.classList.toggle('disabled', !hasFace);
    }

    // Remaining actions require an element
    const hasElement = context && context.elementId;
    [hideItem, similarItem, isolateParent, isolateObject, isolateXray, isolateSection, propsItem].forEach(item => {
      if (item) {
        item.classList.toggle('disabled', !hasElement);
      }
    });
  }

  onClickOutside(e) {
    if (!this.menu.contains(e.target)) {
      this.hide();
    }
  }

  onKeyDown(e) {
    if (e.key === 'Escape') {
      this.hide();
    }
  }

  // Event handling
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => callback(data));
    }
  }

  destroy() {
    document.removeEventListener('click', this.boundOnClickOutside);
    document.removeEventListener('keydown', this.boundOnKeyDown);
    if (this.menu) {
      this.menu.remove();
    }
    this.eventListeners.clear();
  }
}
