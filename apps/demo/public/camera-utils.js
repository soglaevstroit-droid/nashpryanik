(function registerCameraUtils() {
  function stopStream(stream) {
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
  }

  function countVideoInputs(devices) {
    return devices.filter((device) => device.kind === 'videoinput').length;
  }

  function nextFacingMode(current) {
    return current === 'environment' ? 'user' : 'environment';
  }

  window.CameraUtils = { stopStream, countVideoInputs, nextFacingMode };
})();
