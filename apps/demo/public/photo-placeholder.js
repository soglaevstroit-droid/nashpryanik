/* global MutationObserver */

(function registerPhotoPlaceholder() {
  const imageSelector = '.photoSlide > img[data-slider-photo-id]';

  function createPlaceholder() {
    const placeholder = document.createElement('span');
    placeholder.className = 'photoLoadingPlaceholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.innerHTML = `
      <span class="photoLoadingBrand">строит.рф</span>
      <span class="photoLoadingLabel">Загружаем фотографию</span>
      <span class="photoLoadingBlocks">
        <i></i><i></i><i></i>
      </span>
    `;
    return placeholder;
  }

  function updateState(image) {
    const slide = image.closest('.photoSlide');
    if (!slide || slide.classList.contains('is-broken')) return;
    slide.classList.toggle('is-photo-loaded', image.complete && image.naturalWidth > 0);
  }

  function attach(image) {
    if (image.dataset.photoPlaceholderReady) return;
    image.dataset.photoPlaceholderReady = 'true';
    image.before(createPlaceholder());
    image.addEventListener('load', () => updateState(image));
    updateState(image);
  }

  function attachWithin(root) {
    if (root.matches?.(imageSelector)) attach(root);
    for (const image of root.querySelectorAll?.(imageSelector) ?? []) attach(image);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node.nodeType === 1) attachWithin(node);
    }
  });

  attachWithin(document);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
