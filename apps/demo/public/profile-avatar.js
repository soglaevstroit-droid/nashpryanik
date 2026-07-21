(function attachProfileAvatar(globalObject) {
  const avatarsByLogin = Object.freeze({
    ilya: '/assets/ilya-profile.png',
    igor: '/assets/igor-profile.webp?v=20260722',
  });

  function urlForUser(user) {
    const login = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
    return avatarsByLogin[login] ?? null;
  }

  globalObject.ProfileAvatar = Object.freeze({ urlForUser });
})(typeof window === 'undefined' ? globalThis : window);
