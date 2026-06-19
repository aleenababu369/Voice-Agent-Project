import axios from "axios";

export function createApiClient(baseURL: string, token?: string | null) {
  const instance = axios.create({
    baseURL,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error?.response?.status === 401 && typeof window !== "undefined") {
        window.dispatchEvent(new Event("va:unauthorized"));
      }
      return Promise.reject(error);
    }
  );
  return instance;
}
