/**
 * TinyHouse API Wrapper
 * Handles all API communication with the backend
 */

class TinyHouseAPI {
  constructor() {
    this.baseURL = 'http://localhost:3001';
    this.token = localStorage.getItem('token');
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  /**
   * Get authorization headers
   */
  getHeaders(includeAuth = true) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (includeAuth && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * Make HTTP request
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: this.getHeaders(options.auth !== false),
      ...options
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API Error - ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Update stored token
   */
  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  // ========================================
  // AUTHENTICATION API
  // ========================================

  /**
   * User registration
   */
  async register(userData) {
    const response = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
      auth: false
    });

    if (response.token) {
      this.setToken(response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
    }

    return response;
  }

  /**
   * User login
   */
  async login(email, password) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      auth: false
    });

    if (response.token) {
      this.setToken(response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
    }

    return response;
  }

  /**
   * Get user profile
   */
  async getProfile() {
    return await this.request('/auth/profile');
  }

  /**
   * Update user profile
   */
  async updateProfile(profileData) {
    return await this.request('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData)
    });
  }

  /**
   * Change password
   */
  async changePassword(currentPassword, newPassword) {
    return await this.request('/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }

  /**
   * Delete account
   */
  async deleteAccount() {
    const response = await this.request('/auth/delete-account', {
      method: 'DELETE'
    });
    
    this.setToken(null);
    localStorage.removeItem('user');
    
    return response;
  }

  /**
   * Logout
   */
  logout() {
    this.setToken(null);
    localStorage.removeItem('user');
  }

  // ========================================
  // PROPERTIES API
  // ========================================

  /**
   * Get all properties with filters
   */
  async getProperties(filters = {}) {
    const params = new URLSearchParams();
    
    Object.keys(filters).forEach(key => {
      if (filters[key]) {
        params.append(key, filters[key]);
      }
    });

    const endpoint = `/properties${params.toString() ? `?${params}` : ''}`;
    return await this.request(endpoint, { auth: false });
  }

  /**
   * Get single property by ID
   */
  async getProperty(id) {
    return await this.request(`/properties/${id}`, { auth: false });
  }

  /**
   * Create new property (Owner only)
   */
  async createProperty(propertyData) {
    return await this.request('/properties', {
      method: 'POST',
      body: JSON.stringify(propertyData)
    });
  }

  /**
   * Update property (Owner only)
   */
  async updateProperty(id, propertyData) {
    return await this.request(`/properties/${id}`, {
      method: 'PUT',
      body: JSON.stringify(propertyData)
    });
  }

  /**
   * Delete property (Owner only)
   */
  async deleteProperty(id) {
    return await this.request(`/properties/${id}`, {
      method: 'DELETE'
    });
  }

  /**
   * Get owner's properties
   */
  async getMyProperties() {
    return await this.request('/properties/owner/my-properties');
  }

  /**
   * Upload property images
   */
  async uploadPropertyImages(propertyId, images) {
    const formData = new FormData();
    
    for (let i = 0; i < images.length; i++) {
      formData.append('images', images[i]);
    }

    const response = await fetch(`${this.baseURL}/properties/${propertyId}/images`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Upload failed');
    }

    return await response.json();
  }

  // ========================================
  // RESERVATIONS API
  // ========================================

  /**
   * Create new reservation
   */
  async createReservation(reservationData) {
    return await this.request('/reservations', {
      method: 'POST',
      body: JSON.stringify(reservationData)
    });
  }

  /**
   * Get user's reservations
   */
  async getMyReservations(filters = {}) {
    const params = new URLSearchParams();
    
    Object.keys(filters).forEach(key => {
      if (filters[key]) {
        params.append(key, filters[key]);
      }
    });

    const endpoint = `/reservations/my-reservations${params.toString() ? `?${params}` : ''}`;
    return await this.request(endpoint);
  }

  /**
   * Get property owner's reservations
   */
  async getPropertyReservations(filters = {}) {
    const params = new URLSearchParams();
    
    Object.keys(filters).forEach(key => {
      if (filters[key]) {
        params.append(key, filters[key]);
      }
    });

    const endpoint = `/reservations/property-reservations${params.toString() ? `?${params}` : ''}`;
    return await this.request(endpoint);
  }

  /**
   * Get single reservation details
   */
  async getReservation(id) {
    return await this.request(`/reservations/${id}`);
  }

  /**
   * Update reservation status
   */
  async updateReservationStatus(id, status, reason = null) {
    return await this.request(`/reservations/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, reason })
    });
  }

  /**
   * Cancel reservation
   */
  async cancelReservation(id, reason = 'Cancelled by user') {
    return await this.request(`/reservations/${id}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ reason })
    });
  }

  /**
   * Get reservation statistics
   */
  async getReservationStatistics() {
    return await this.request('/reservations/statistics');
  }

  // ========================================
  // PAYMENTS API
  // ========================================

  /**
   * Create payment
   */
  async createPayment(paymentData) {
    return await this.request('/payments', {
      method: 'POST',
      body: JSON.stringify(paymentData)
    });
  }

  /**
   * Get payment history
   */
  async getPaymentHistory() {
    return await this.request('/payments/history');
  }

  // ========================================
  // REVIEWS API
  // ========================================

  /**
   * Create review
   */
  async createReview(reviewData) {
    return await this.request('/reviews', {
      method: 'POST',
      body: JSON.stringify(reviewData)
    });
  }

  /**
   * Get reviews for property
   */
  async getPropertyReviews(propertyId) {
    return await this.request(`/reviews/property/${propertyId}`, { auth: false });
  }

  /**
   * Get user's reviews
   */
  async getMyReviews() {
    return await this.request('/reviews/my-reviews');
  }

  /**
   * Update review
   */
  async updateReview(id, reviewData) {
    return await this.request(`/reviews/${id}`, {
      method: 'PUT',
      body: JSON.stringify(reviewData)
    });
  }

  /**
   * Delete review
   */
  async deleteReview(id) {
    return await this.request(`/reviews/${id}`, {
      method: 'DELETE'
    });
  }

  // ========================================
  // ADMIN API (Admin only)
  // ========================================

  /**
   * Get dashboard statistics (Admin)
   */
  async getAdminStats() {
    return await this.request('/admin/dashboard-stats');
  }

  /**
   * Get all users (Admin)
   */
  async getAllUsers() {
    return await this.request('/admin/users');
  }

  /**
   * Toggle user status (Admin)
   */
  async toggleUserStatus(userId) {
    return await this.request(`/admin/users/${userId}/toggle-status`, {
      method: 'PUT'
    });
  }

  /**
   * Get all properties (Admin)
   */
  async getAllProperties() {
    return await this.request('/admin/properties');
  }

  /**
   * Get top-rated properties (Admin)
   */
  async getTopProperties() {
    return await this.request('/admin/top-properties');
  }

  /**
   * Get all reservations (Admin)
   */
  async getAllReservations(filters = {}) {
    const params = new URLSearchParams();
    
    Object.keys(filters).forEach(key => {
      if (filters[key]) {
        params.append(key, filters[key]);
      }
    });

    const endpoint = `/reservations/admin/all${params.toString() ? `?${params}` : ''}`;
    return await this.request(endpoint);
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Health check
   */
  async healthCheck() {
    return await this.request('/api/health', { auth: false });
  }

  /**
   * Test database connection
   */
  async testDatabase() {
    return await this.request('/test-db', { auth: false });
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.token;
  }

  /**
   * Get current user from localStorage
   */
  getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  }

  /**
   * Check if user has specific role
   */
  hasRole(role) {
    const user = this.getCurrentUser();
    return user && user.role === role;
  }

  /**
   * Format currency
   */
  static formatCurrency(amount) {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY'
    }).format(amount);
  }

  /**
   * Format date
   */
  static formatDate(dateString, options = {}) {
    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    };

    return new Date(dateString).toLocaleDateString('en-US', {
      ...defaultOptions,
      ...options
    });
  }

  /**
   * Calculate nights between dates
   */
  static calculateNights(checkIn, checkOut) {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Validate email format
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone format
   */
  static isValidPhone(phone) {
    const phoneRegex = /^[0-9+()-\s]+$/;
    return phoneRegex.test(phone);
  }
}

// Create global API instance
const API = new TinyHouseAPI();

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TinyHouseAPI, API };
}

// Global error handler for unhandled API errors
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message) {
    console.error('Unhandled API Error:', event.reason.message);
    
    // Redirect to login if unauthorized
    if (event.reason.message.includes('401') || event.reason.message.includes('Unauthorized')) {
      API.logout();
      if (!window.location.pathname.includes('login.html')) {
        window.location.href = '/frontend/pages/login.html';
      }
    }
  }
});

// Auto-refresh token on page focus (optional enhancement)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && API.isAuthenticated()) {
    // Optionally refresh user profile on page focus
    API.getProfile().catch(() => {
      // If profile fetch fails, user might be logged out
      console.log('Session validation failed');
    });
  }
});

console.log('🚀 TinyHouse API initialized successfully');