/* global Image, IntersectionObserver, ResizeObserver, URL */

(function registerPhotoSlider() {
  class PhotoSlider {
    constructor({ loadPhoto, loadPreview, loadOriginal, viewer, onLockedAttempt }) {
      this.loadPreview = loadPreview ?? loadPhoto;
      this.loadOriginal = loadOriginal ?? loadPhoto;
      this.viewer = viewer;
      this.onLockedAttempt = onLockedAttempt;
      this.viewerImages = [];
      this.viewerIndex = 0;
      this.viewerRequest = 0;
      this.viewerOriginalId = null;
      this.scale = 1;
      this.translateX = 0;
      this.translateY = 0;
      this.pointers = new Map();
      this.startDistance = 0;
      this.startScale = 1;
      this.lastTapAt = 0;
      this.previewCache = new Map();
      this.originalCache = new Map();
      this.previewLoads = new Map();
      this.originalLoads = new Map();
      this.imageCacheKeys = new WeakMap();
      this.loadJobs = new Map();
      this.loadQueue = [];
      this.loadOrder = 0;
      this.activeLoads = 0;
      this.maxConcurrentLoads = 4;
      this.visibilityObserver =
        'IntersectionObserver' in window
          ? new IntersectionObserver(
              (entries) => {
                for (const entry of entries)
                  if (entry.isIntersecting) this.startSlider(entry.target);
              },
              { rootMargin: '600px 0px', threshold: 0.01 },
            )
          : null;
      this.bindViewer();
      window.addEventListener('beforeunload', () => this.destroy(), { once: true });
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
      const layoutClass = photos.length === 1 ? 'is-single' : 'is-multiple';
      return `<div class="photoSlider ${layoutClass}" data-photo-slider="${escapeText(id)}" data-photo-locked="${locked}"><div class="photoCarousel" data-photo-carousel aria-label="Фотографии">${slides}</div>${dots}</div>`;
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
        if ('ResizeObserver' in window) {
          const resizeObserver = new ResizeObserver(() => {
            for (const image of carousel.querySelectorAll('[data-slider-photo-id][src]'))
              this.sizeSlide(image);
          });
          resizeObserver.observe(carousel);
        }
        this.updateIndicator(slider);
        if (this.visibilityObserver) this.visibilityObserver.observe(slider);
        else this.startSlider(slider);
      }
    }

    clear(root) {
      for (const slider of root.querySelectorAll('[data-photo-slider]'))
        this.visibilityObserver?.unobserve(slider);
      for (const image of root.querySelectorAll('[data-slider-photo-id]')) this.releaseImage(image);
      this.evictCache(this.previewCache, 200);
      this.evictCache(this.originalCache, 40);
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
      const artifactId = image.dataset.sliderPhotoId;
      try {
        try {
          const previewUrl = await this.getPhotoUrl(
            this.previewCache,
            this.previewLoads,
            this.loadPreview,
            artifactId,
            200,
          );
          if (
            await this.assignImage(
              image,
              previewUrl,
              () => this.retainImage(image, this.previewCache, artifactId),
            )
          ) {
            this.sizeSlide(image);
            return true;
          }
          this.discardCacheEntry(this.previewCache, artifactId);
        } catch {
          this.discardCacheEntry(this.previewCache, artifactId);
        }
        try {
          const originalUrl = await this.getPhotoUrl(
            this.originalCache,
            this.originalLoads,
            this.loadOriginal,
            artifactId,
            40,
          );
          if (
            await this.assignImage(
              image,
              originalUrl,
              () => this.retainImage(image, this.originalCache, artifactId),
            )
          ) {
            this.sizeSlide(image);
            return true;
          }
        } catch {
          // The shared error state below is used only after both preview and original fail.
        }
        slide.classList.add('is-broken');
        image.alt = 'Не удалось загрузить фото';
        return false;
      } finally {
        delete image.dataset.photoLoading;
      }
    }

    assignImage(image, url, onLoad) {
      return new Promise((resolve) => {
        const cleanup = () => {
          image.removeEventListener('load', handleLoad);
          image.removeEventListener('error', handleError);
        };
        const handleLoad = () => {
          cleanup();
          onLoad();
          resolve(true);
        };
        const handleError = () => {
          cleanup();
          resolve(false);
        };
        image.addEventListener('load', handleLoad);
        image.addEventListener('error', handleError);
        image.src = url;
      });
    }

    startSlider(slider) {
      if (!slider || slider.dataset.photoLoadStarted) return;
      slider.dataset.photoLoadStarted = 'true';
      this.visibilityObserver?.unobserve(slider);
      const slides = [...slider.querySelectorAll('[data-photo-slide]')];
      if (!slides.length) return;
      void this.enqueue(slides[0], 'high')
        .then(() =>
          Promise.all([
            slides[1] ? this.enqueue(slides[1], 'normal') : true,
            slides[2] ? this.enqueue(slides[2], 'normal') : true,
          ]),
        )
        .then(() => {
          for (const slide of slides.slice(3)) void this.enqueue(slide, 'low');
        });
    }

    enqueue(slide, priority) {
      const image = slide?.querySelector('[data-slider-photo-id]');
      if (!image || image.hasAttribute('src')) return Promise.resolve(true);
      const rank = { high: 0, normal: 1, low: 2 }[priority];
      const existing = this.loadJobs.get(slide);
      if (existing) {
        existing.rank = Math.min(existing.rank, rank);
        this.drainQueue();
        return existing.promise;
      }
      let resolveJob;
      const promise = new Promise((resolve) => {
        resolveJob = resolve;
      });
      const job = {
        slide,
        rank,
        order: ++this.loadOrder,
        promise,
        resolve: resolveJob,
      };
      this.loadJobs.set(slide, job);
      this.loadQueue.push(job);
      this.drainQueue();
      return promise;
    }

    drainQueue() {
      this.loadQueue.sort((left, right) => left.rank - right.rank || left.order - right.order);
      while (this.activeLoads < this.maxConcurrentLoads && this.loadQueue.length) {
        const job = this.loadQueue.shift();
        this.activeLoads += 1;
        void this.loadSlide(job.slide)
          .then((loaded) => job.resolve(loaded))
          .finally(() => {
            this.activeLoads -= 1;
            this.loadJobs.delete(job.slide);
            this.drainQueue();
          });
      }
    }

    sizeSlide(image) {
      if (!image.naturalWidth || !image.naturalHeight) return;
      const slide = image.closest('[data-photo-slide]');
      if (slide.closest('[data-photo-slider]')?.classList?.contains('is-single')) {
        slide.style.width = '100%';
        return;
      }
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
      if (slider.dataset.photoLoadStarted) {
        const previousScrollLeft = Number(slider.dataset.photoScrollLeft ?? 0);
        const direction = carousel.scrollLeft >= previousScrollLeft ? 1 : -1;
        void this.enqueue(slides[index], 'high');
        if (slides[index + direction]) void this.enqueue(slides[index + direction], 'high');
        slider.dataset.photoScrollLeft = String(carousel.scrollLeft);
      }
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
      this.viewerOriginalId = null;
      this.resetTransform();
      this.renderViewer();
      this.viewer.root.hidden = false;
      document.body.classList.add('is-photo-viewer-open');
    }

    close() {
      this.viewer.root.hidden = true;
      this.viewerRequest += 1;
      this.viewerOriginalId = null;
      if (this.viewer.status) this.viewer.status.hidden = true;
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
      if (this.viewer.status) this.viewer.status.hidden = true;
      this.applyTransform();
      void this.loadViewerOriginal(image);
    }

    async loadViewerOriginal(image) {
      const artifactId = image.dataset.sliderPhotoId;
      const request = ++this.viewerRequest;
      this.viewerOriginalId = artifactId;
      try {
        const url = await this.getPhotoUrl(
          this.originalCache,
          this.originalLoads,
          this.loadOriginal,
          artifactId,
          40,
        );
        await new Promise((resolve, reject) => {
          const original = new Image();
          original.addEventListener('load', resolve, { once: true });
          original.addEventListener('error', reject, { once: true });
          original.src = url;
        });
        if (
          request !== this.viewerRequest ||
          this.viewerImages[this.viewerIndex] !== image ||
          this.viewer.root.hidden
        )
          return;
        this.viewer.image.src = url;
      } catch {
        if (request !== this.viewerRequest || this.viewer.root.hidden) return;
        if (this.viewer.status) {
          this.viewer.status.textContent =
            'Оригинал недоступен. Показываем загруженную версию фотографии.';
          this.viewer.status.hidden = false;
        }
      }
    }

    async getPhotoUrl(cache, pending, loader, artifactId, limit) {
      const cached = cache.get(artifactId);
      if (cached) {
        cached.lastUsed = Date.now();
        return cached.url;
      }
      if (pending.has(artifactId)) return pending.get(artifactId);
      const request = loader(artifactId)
        .then((blob) => {
          const entry = {
            url: URL.createObjectURL(blob),
            users: new Set(),
            lastUsed: Date.now(),
          };
          cache.set(artifactId, entry);
          this.evictCache(cache, limit);
          return entry.url;
        })
        .finally(() => pending.delete(artifactId));
      pending.set(artifactId, request);
      return request;
    }

    retainImage(image, cache, artifactId) {
      this.releaseImage(image);
      const entry = cache.get(artifactId);
      if (!entry) return;
      entry.users.add(image);
      entry.lastUsed = Date.now();
      this.imageCacheKeys.set(image, { artifactId, cache });
    }

    releaseImage(image) {
      const owner = this.imageCacheKeys.get(image);
      if (!owner) return;
      owner.cache.get(owner.artifactId)?.users.delete(image);
      this.imageCacheKeys.delete(image);
    }

    discardCacheEntry(cache, artifactId) {
      const entry = cache.get(artifactId);
      if (!entry || entry.users.size) return;
      URL.revokeObjectURL(entry.url);
      cache.delete(artifactId);
    }

    evictCache(cache, limit) {
      if (cache.size <= limit) return;
      const removable = [...cache.entries()]
        .filter(
          ([artifactId, entry]) =>
            entry.users.size === 0 &&
            !(cache === this.originalCache && artifactId === this.viewerOriginalId),
        )
        .sort((left, right) => left[1].lastUsed - right[1].lastUsed);
      while (cache.size > limit && removable.length) {
        const [artifactId, entry] = removable.shift();
        URL.revokeObjectURL(entry.url);
        cache.delete(artifactId);
      }
    }

    destroy() {
      this.visibilityObserver?.disconnect();
      for (const cache of [this.previewCache, this.originalCache]) {
        for (const entry of cache.values()) URL.revokeObjectURL(entry.url);
        cache.clear();
      }
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
