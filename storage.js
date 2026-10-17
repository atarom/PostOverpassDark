export const storage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
  removePrefix(prefix) {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) localStorage.removeItem(key);
      }
    } catch {}
  }
};
