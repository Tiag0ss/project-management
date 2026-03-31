const ENDPOINT_KEY = 'pm_api_endpoint';
const TOKEN_KEY = 'pm_api_token';

export const storage = {
  getEndpoint: (): string => localStorage.getItem(ENDPOINT_KEY) || '',
  setEndpoint: (val: string): void => localStorage.setItem(ENDPOINT_KEY, val.trim().replace(/\/$/, '')),

  getApiToken: (): string => localStorage.getItem(TOKEN_KEY) || '',
  setApiToken: (val: string): void => localStorage.setItem(TOKEN_KEY, val.trim()),

  isConfigured: (): boolean => {
    return Boolean(localStorage.getItem(ENDPOINT_KEY) && localStorage.getItem(TOKEN_KEY));
  },

  clear: (): void => {
    localStorage.removeItem(ENDPOINT_KEY);
    localStorage.removeItem(TOKEN_KEY);
  },
};
