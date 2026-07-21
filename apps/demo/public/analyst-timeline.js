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
    const positions = new Map();
    return Object.freeze({
      get(workerKey, frames) {
        const frameIds = Array.isArray(frames) ? frames : null;
        const frameCount = frameIds?.length ?? frames;
        const stored = positions.get(workerKey);
        if (frameIds && stored?.frameId) {
          const matchingIndex = frameIds.indexOf(stored.frameId);
          if (matchingIndex >= 0) return matchingIndex;
        }
        return resolveInitialIndex(stored?.index, frameCount);
      },
      set(workerKey, index, frameId = null) {
        if (workerKey && Number.isInteger(index)) positions.set(workerKey, { index, frameId });
      },
    });
  }

  globalThis.AnalystTimeline = Object.freeze({
    createIndexStore,
    findActiveIndex,
    resolveInitialIndex,
  });
})();
