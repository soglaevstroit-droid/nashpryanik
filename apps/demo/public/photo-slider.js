/* global ResizeObserver, URL */

(function registerPhotoSlider() {
  class PhotoSlider {
    constructor({ loadPhoto, viewer, onLockedAttempt }) {
      this.loadPhoto = loadPhoto;
      this.viewer = viewer;
      this.onLockedAttempt = onLockedAttempt;
      this.urls = new Set();
      this.viewerImages = [];
      this.viewerIndex = 0;
      this.scale = 1;
      this.translateX = 0;
      this.translateY = 0;
      this.pointers = new Map();
      this.startDistance = 0;
      this.startScale = 1;
      this.lastTapAt = 0;
      this.bindViewer();
    }

    static render(photos, { id, emptyText = '', showEmpty = true, locked = false } = {}) {
      if (!photos?.length)
        return showEmpty ? `<p class="photoEmptyState">${escapeText(emptyText)}</p>` : '';
      const slides = photos
        .map(
          (photo, index) =>
            `<article class="photoSlide" data-photo-slide><img data-slider-photo-id="${escapeText(photo.id)}" data-photo-gallery="${escapeText(id)}" alt="${escapeText(photo.originalFileName || 'Фото')}" aria-label="Фото ${index + 1} из ${photos.length}" /><span class="photoLockOverlay" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10V7a5 5 0 0 1 10 0v3"/><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M12 14v3"/></svg></span></article>`,
        )
        .join('');
      const dots =
        photos.length > 1
          ? `<div class="photoDots" aria-hidden="true">${photos.map((_, index) => `<i class="${index === 0 ? 'is-active' : ''}" data-photo-dot="${index}"></i>`).join('')}</div>`
          : '';
      return `<div class="photoSlider" data-photo-slider="${escapeText(id)}" data-photo-locked="${locked}"><div class="photoCarousel" data-photo-carousel aria-label="Фотографии">${slides}</div>${dots}</div>`;
    }

    mount(root) {
      for (const slider of root.querySelectorAll('[data-photo-slider]:not([data-slider-ready])')) {
        slider.dataset.sliderReady = 'true';
        const carousel = slider.querySelector('[data-photo-carousel]');
        carousel.scrollLeft = 0;
        carousel.addEventListener('scroll', () => this.updateIndicator(slider), { passive: true });
        carousel.addEventListener('dblclick', (event) => {
          const image = event.target.closest('[data-slider-photo-id]');
          if (image) this.open(image);
        });
        carousel.addEventListener('pointerup', (event) => this.handleGalleryTap(event));
        for (const slide of carousel.querySelectorAll('[data-photo-slide]')) void this.loadSlide(slide);
        if ('ResizeObserver' in window) {
          const resizeObserver = new ResizeObserver(() => {
            for (const image of carousel.querySelectorAll('[data-slider-photo-id][src]'))
              this.sizeSlide(image);
          });
          resizeObserver.observe(carousel);
        }
        this.updateIndicator(slider);
      }
    }

    clear(root) {
      for (const image of root.querySelectorAll('[data-slider-photo-id][src^="blob:"]')) {
        URL.revokeObjectURL(image.src);
        this.urls.delete(image.src);
      }
    }

    setLocked(root, locked) {
      for (const slider of root.querySelectorAll('[data-photo-slider]'))
        slider.dataset.photoLocked = String(locked);
      if (locked && !this.viewer.root.hidden) this.close();
    }

    isLocked(element) {
      return element?.closest('[data-photo-slider]')?.dataset.photoLocked === 'true';
    }

    async loadSlide(slide) {
      const image = slide?.querySelector('[data-slider-photo-id]');
      if (!image || image.dataset.photoLoading || image.hasAttribute('src')) return;
      image.dataset.photoLoading = 'true';
      try {
        const blob = await this.loadPhoto(image.dataset.sliderPhotoId);
        const url = URL.createObjectURL(blob);
        this.urls.add(url);
        image.addEventListener('load', () => this.sizeSlide(image), { once: true });
        image.src = url;
      } catch {
        slide.classList.add('is-broken');
        image.alt = 'Не удалось загрузить фото';
      } finally {
        delete image.dataset.photoLoading;
      }
    }

    sizeSlide(image) {
      if (!image.naturalWidth || !image.naturalHeight) return;
      const slide = image.closest('[data-photo-slide]');
      const carousel = slide.closest('[data-photo-carousel]');
      const height = slide.getBoundingClientRect().height;
      const intrinsicWidth = height * (image.naturalWidth / image.naturalHeight);
      slide.style.width = `${Math.min(intrinsicWidth, carousel.clientWidth * 0.88)}px`;
    }

    updateIndicator(slider) {
      const carousel = slider.querySelector('[data-photo-carousel]');
      const slides = [...carousel.querySelectorAll('[data-photo-slide]')];
      if (!slides.length) return;
      const index = slides.reduce(
        (closest, slide, current) =>
          Math.abs(slide.offsetLeft - carousel.scrollLeft) <
          Math.abs(slides[closest].offsetLeft - carousel.scrollLeft)
            ? current
            : closest,
        0,
      );
      for (const [dotIndex, dot] of [...slider.querySelectorAll('[data-photo-dot]')].entries())
        dot.classList.toggle('is-active', dotIndex === index);
    }

    handleGalleryTap(event) {
      if (event.pointerType !== 'touch') return;
      const image = event.target.closest('[data-slider-photo-id]');
      if (!image) return;
      const now = Date.now();
      if (now - this.lastTapAt < 320) this.open(image);
      this.lastTapAt = now;
    }

    open(image) {
      if (this.isLocked(image)) {
        this.onLockedAttempt?.();
        return;
      }
      const gallery = image.dataset.photoGallery;
      this.viewerImages = [...document.querySelectorAll('[data-photo-gallery]')].filter(
        (candidate) => candidate.dataset.photoGallery === gallery && candidate.src,
      );
      this.viewerIndex = Math.max(0, this.viewerImages.indexOf(image));
      this.resetTransform();
      this.renderViewer();
      this.viewer.root.hidden = false;
      document.body.classList.add('is-photo-viewer-open');
    }

    close() {
      this.viewer.root.hidden = true;
      document.body.classList.remove('is-photo-viewer-open');
      this.pointers.clear();
      this.resetTransform();
    }

    move(offset) {
      if (this.scale > 1 || !this.viewerImages.length) return;
      this.viewerIndex =
        (this.viewerIndex + offset + this.viewerImages.length) % this.viewerImages.length;
      this.resetTransform();
      this.renderViewer();
    }

    renderViewer() {
      const image = this.viewerImages[this.viewerIndex];
      if (!image) return;
      this.viewer.image.src = image.src;
      this.viewer.image.alt = image.alt;
      this.applyTransform();
    }

    bindViewer() {
      this.viewer.root.addEventListener('click', (event) => {
        if (event.target === this.viewer.root || event.target.closest('[data-close-photo-viewer]'))
          this.close();
        else if (event.target.closest('[data-photo-viewer-previous]')) this.move(-1);
        else if (event.target.closest('[data-photo-viewer-next]')) this.move(1);
      });
      this.viewer.image.addEventListener('dblclick', () => this.toggleZoom());
      this.viewer.image.addEventListener('pointerdown', (event) => this.pointerDown(event));
      this.viewer.image.addEventListener('pointermove', (event) => this.pointerMove(event));
      this.viewer.image.addEventListener('pointerup', (event) => this.pointerUp(event));
      this.viewer.image.addEventListener('pointercancel', (event) => this.pointerUp(event));
    }

    pointerDown(event) {
      this.viewer.image.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
      });
      if (this.pointers.size === 2) {
        this.startDistance = pointerDistance([...this.pointers.values()]);
        this.startScale = this.scale;
      }
    }

    pointerMove(event) {
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (this.pointers.size === 2) {
        const distance = pointerDistance([...this.pointers.values()]);
        this.scale = clamp(this.startScale * (distance / this.startDistance), 1, 4);
      } else {
        this.translateX += dx;
        this.translateY += dy;
      }
      this.applyTransform();
    }

    pointerUp(event) {
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer) return;
      const totalX = event.clientX - pointer.startX;
      const totalY = event.clientY - pointer.startY;
      this.pointers.delete(event.pointerId);
      const now = Date.now();
      if (Math.abs(totalX) < 12 && Math.abs(totalY) < 12 && now - this.lastTapAt < 320)
        this.toggleZoom();
      this.lastTapAt = now;
      if (this.scale === 1 && totalY > 100 && Math.abs(totalY) > Math.abs(totalX))
        return this.close();
      if (this.scale === 1 && Math.abs(totalX) > 60 && Math.abs(totalX) > Math.abs(totalY)) {
        this.translateX = 0;
        this.translateY = 0;
        return this.move(totalX < 0 ? 1 : -1);
      }
      if (this.scale === 1) this.resetTransform();
      this.applyTransform();
    }

    toggleZoom() {
      this.scale = this.scale > 1 ? 1 : 2.5;
      if (this.scale === 1) {
        this.translateX = 0;
        this.translateY = 0;
      }
      this.applyTransform();
    }

    resetTransform() {
      this.scale = 1;
      this.translateX = 0;
      this.translateY = 0;
    }

    applyTransform() {
      this.viewer.image.style.transform = `translate3d(${this.translateX}px, ${this.translateY}px, 0) scale(${this.scale})`;
    }
  }

  function pointerDistance([first, second]) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function escapeText(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  window.PhotoSlider = PhotoSlider;
})();
