import axios from "axios";

export function createApiClient(baseURL: string) {
  return axios.create({
    baseURL,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
