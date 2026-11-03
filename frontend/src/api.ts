import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ort_access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retry && localStorage.getItem("ort_refresh_token")) {
      original._retry = true;
      try {
        const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, {
          refresh_token: localStorage.getItem("ort_refresh_token"),
        });
        localStorage.setItem("ort_access_token", data.access_token);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch {
        localStorage.removeItem("ort_access_token");
        localStorage.removeItem("ort_refresh_token");
        window.dispatchEvent(new Event("ort:unauthorized"));
      }
    }
    return Promise.reject(error);
  },
);

export interface User {
  id: number | string;
  name: string;
  email: string;
  role: "admin" | "manager" | "student";
  waste_score: number;
  total_points: number;
  total_waste_grams?: number;
  badges?: (string | { name: string })[];
}
export interface WasteEvent {
  id: number | string;
  user_id?: number | string;
  user_name?: string;
  weight_grams: number;
  food_items: (string | { name: string; confidence?: number })[];
  meal_type: string;
  status: string;
  timestamp: string;
}
export const getError = (error: unknown): string => {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return "Unable to reach the server. Check your connection and try again.";
  }

  const response = (error as {
    response?: {
      status?: number;
      statusText?: string;
      data?: { detail?: unknown; message?: unknown };
    };
  }).response;
  const detail = response?.data?.detail ?? response?.data?.message;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => typeof item === "object" && item !== null && "msg" in item ? String(item.msg) : String(item))
      .filter(Boolean);
    if (messages.length) return messages.join(". ");
  }
  if (detail && typeof detail === "object") {
    return JSON.stringify(detail);
  }
  if (response?.status) {
    return `Request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""}).`;
  }
  return "The server returned an error without details.";
};
export default api;
