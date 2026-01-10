import axios from 'axios';

const BACKEND_URL="http://localhost:5001";

const api = axios.create({
    baseURL: import.meta.env.MODE === 'development' ? `${BACKEND_URL}/api` : "/api",
    withCredentials: true, // Include cookies in requests
});

export default api;