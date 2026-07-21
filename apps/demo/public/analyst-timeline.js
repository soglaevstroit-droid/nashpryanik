(function registerAnalystTimeline() {
  function resolveInitialIndex(storedIndex, frameCount) {
    if (frameCount <= 0) return -1;
    return Number.isInteger(storedIndex)
      ? Math.min(Math.max(storedIndex, 0), frameCount - 1)
      : frameCount - 1;
  }

  function findActiveIndex(slides, scrollLeft, clientWidth) {
    if (!slides.length) return -1;
    const viewportStart = scrollLeft;
    const viewportEnd = scrollLeft + clientWidth;
    const viewportCenter = viewportStart + clientWidth / 2;
    let activeIndex = 0;
    let activeOverlap = -1;
    let activeCenterDistance = Number.POSITIVE_INFINITY;

    for (const [index, slide] of slides.entries()) {
      const slideStart = slide.offsetLeft;
      const slideEnd = slideStart + slide.offsetWidth;
      const overlap = Math.max(
        0,
        Math.min(slideEnd, viewportEnd) - Math.max(slideStart, viewportStart),
      );
      const centerDistance = Math.abs(slideStart + slide.offsetWidth / 2 - viewportCenter);
      if (
        overlap > activeOverlap ||
        (overlap === activeOverlap && centerDistance < activeCenterDistance)
      ) {
        activeIndex = index;
        activeOverlap = overlap;
        activeCenterDistance = centerDistance;
      }
    }

    return activeIndex;
  }

  function createIndexStore() {
    const indexes = new Map();
    return Object.freeze({
      get(workerKey, frameCount) {
        return resolveInitialIndex(indexes.get(workerKey), frameCount);
      },
      set(workerKey, index) {
        if (workerKey && Number.isInteger(index)) indexes.set(workerKey, index);
      },
    });
  }

  globalThis.AnalystTimeline = Object.freeze({
    createIndexStore,
    findActiveIndex,
    resolveInitialIndex,
  });
})();
