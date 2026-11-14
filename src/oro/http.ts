import axios from "axios";

// Every request the overlay makes (data.json, the Google Sheet, try-z for maps
// and profiles) goes through this client. axios waits forever by default, so a
// request that hung left its part of the overlay "loading" for the whole match:
// a player's rank and banner, the pool, the qualifiers. Now it fails in time
// and whoever asked can try again.
export const http = axios.create({ timeout: 10_000 });

export const isNotFound = (e: unknown) => axios.isAxiosError(e) && e.response?.status === 404;
