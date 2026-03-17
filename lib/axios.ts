import axios from 'axios';
import { serverDebug, serverError } from './server-logger';

// Create a simple axios instance with basic configuration
// Node.js will automatically handle CA certificates when NODE_EXTRA_CA_CERTS is set
const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

axiosInstance.interceptors.request.use(
  (config) => {
    serverDebug('Outbound HTTP request.', {
      method: config.method?.toUpperCase(),
      url: config.url
    });
    return config;
  },
  (error) => {
    serverError('HTTP request interceptor failed.', error);
    return Promise.reject(error);
  }
);

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'CERT_UNTRUSTED' || error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      serverError('TLS certificate verification failed.', {
        code: error.code,
        message: error.message
      });
    }
    return Promise.reject(error);
  }
);

export { axiosInstance };
export default axiosInstance;
