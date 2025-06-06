// html-frontend/js/auth.js
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  // Configuration
  const API_BASE_URL = 'http://localhost:3001';
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 second

  // Utility functions
  function showError(message, fieldName = null) {
      const errorElement = document.getElementById('errorMsg');
      if (errorElement) {
          errorElement.textContent = message;
          errorElement.style.display = 'block';
          
          // Highlight the specific field if provided
          if (fieldName) {
              const field = document.getElementById(fieldName);
              if (field) {
                  field.style.borderColor = '#ef4444';
                  field.focus();
              }
          }
      }
      console.error('Auth Error:', message);
  }

  function clearErrors() {
      const errorElement = document.getElementById('errorMsg');
      if (errorElement) {
          errorElement.textContent = '';
          errorElement.style.display = 'none';
      }
      
      // Clear field highlighting
      const inputs = document.querySelectorAll('input, select');
      inputs.forEach(input => {
          input.style.borderColor = '';
      });
  }

  function showLoading(button, isLoading = true) {
      if (isLoading) {
          button.disabled = true;
          button.dataset.originalText = button.textContent;
          button.textContent = 'Loading...';
      } else {
          button.disabled = false;
          button.textContent = button.dataset.originalText || button.textContent;
      }
  }

  // Enhanced fetch with retry logic
  async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
      for (let i = 0; i < retries; i++) {
          try {
              console.log(`🔄 Attempt ${i + 1} to ${url}`);
              
              const response = await fetch(url, {
                  ...options,
                  headers: {
                      'Content-Type': 'application/json',
                      ...options.headers
                  }
              });

              // If we get a response, return it (even if it's an error status)
              return response;
          } catch (error) {
              console.error(`❌ Attempt ${i + 1} failed:`, error.message);
              
              // If this is the last attempt, throw the error
              if (i === retries - 1) {
                  throw error;
              }
              
              // Wait before retrying
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (i + 1)));
          }
      }
  }

  // Test connection to backend
  async function testConnection() {
      try {
          const response = await fetchWithRetry(`${API_BASE_URL}/auth/test`, {
              method: 'GET'
          }, 2);
          
          if (response.ok) {
              console.log('✅ Backend connection successful');
              return true;
          } else {
              console.warn('⚠️ Backend responded with error:', response.status);
              return false;
          }
      } catch (error) {
          console.error('❌ Backend connection failed:', error);
          return false;
      }
  }

  // LOGIN HANDLER
  if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          clearErrors();

          const submitButton = loginForm.querySelector('button[type="submit"]');
          showLoading(submitButton, true);

          const email = document.getElementById('email').value.trim();
          const password = document.getElementById('password').value;

          // Basic validation
          if (!email || !password) {
              showError('Please fill in all fields');
              showLoading(submitButton, false);
              return;
          }

          try {
              // Test connection first
              const isConnected = await testConnection();
              if (!isConnected) {
                  showError('Cannot connect to server. Please check your internet connection and try again.');
                  showLoading(submitButton, false);
                  return;
              }

              const response = await fetchWithRetry(`${API_BASE_URL}/auth/login`, {
                  method: 'POST',
                  body: JSON.stringify({ email, password })
              });

              const data = await response.json();

              if (response.ok && data.success) {
                  console.log('✅ Login successful');
                  
                  // Store token and user data
                  localStorage.setItem('token', data.token);
                  localStorage.setItem('user', JSON.stringify(data.user));
                  
                  // Redirect based on role
                  const role = data.user.role;
                  let redirectUrl;
                  
                  switch (role) {
                      case 'tenant':
                          redirectUrl = 'tenant/dashboard_tenant.html';
                          break;
                      case 'owner':
                          redirectUrl = 'owner/dashboard_owner.html';
                          break;
                      case 'admin':
                          redirectUrl = 'admin/dashboard_admin.html';
                          break;
                      default:
                          redirectUrl = 'tenant/dashboard_tenant.html';
                  }
                  
                  window.location.href = redirectUrl;
              } else {
                  console.error('❌ Login failed:', data.message);
                  showError(data.message || 'Login failed. Please try again.', data.field);
              }
          } catch (error) {
              console.error('❌ Login error:', error);
              if (error.name === 'TypeError' && error.message.includes('fetch')) {
                  showError('Cannot connect to server. Please check your internet connection.');
              } else {
                  showError('Login failed. Please try again.');
              }
          } finally {
              showLoading(submitButton, false);
          }
      });
  }

  // REGISTRATION HANDLER
  if (registerForm) {
      registerForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          clearErrors();

          const submitButton = registerForm.querySelector('button[type="submit"]');
          showLoading(submitButton, true);

          // Get form values
          const firstName = document.getElementById('firstName').value.trim();
          const lastName = document.getElementById('lastName').value.trim();
          const email = document.getElementById('email').value.trim();
          const password = document.getElementById('password').value;
          const phone = document.getElementById('phone').value.trim();
          const role = document.getElementById('role').value;

          // Basic validation
          if (!firstName || !lastName || !email || !password || !role) {
              showError('Please fill in all required fields');
              showLoading(submitButton, false);
              return;
          }

          if (password.length < 6) {
              showError('Password must be at least 6 characters long', 'password');
              showLoading(submitButton, false);
              return;
          }

          try {
              // Test connection first
              const isConnected = await testConnection();
              if (!isConnected) {
                  showError('Cannot connect to server. Please check your internet connection and try again.');
                  showLoading(submitButton, false);
                  return;
              }

              const response = await fetchWithRetry(`${API_BASE_URL}/auth/register`, {
                  method: 'POST',
                  body: JSON.stringify({
                    first_name: firstName,
                    last_name: lastName,
                    email,
                    password,
                    phone,
                    user_role: role
                  })
                  
              });

              const data = await response.json();

              if (response.ok && data.success) {
                  console.log('✅ Registration successful');
                  
                  // Store token and user data
                  localStorage.setItem('token', data.token);
                  localStorage.setItem('user', JSON.stringify(data.user));
                  
                  // Redirect based on role
                  const userRole = data.user.role;
                  let redirectUrl;
                  
                  switch (userRole) {
                      case 'tenant':
                          redirectUrl = 'tenant/dashboard_tenant.html';
                          break;
                      case 'owner':
                          redirectUrl = 'owner/dashboard_owner.html';
                          break;
                      case 'admin':
                          redirectUrl = 'admin/dashboard_admin.html';
                          break;
                      default:
                          redirectUrl = 'tenant/dashboard_tenant.html';
                  }
                  
                  window.location.href = redirectUrl;
              } else {
                  console.error('❌ Registration failed:', data.message);
                  showError(data.message || 'Registration failed. Please try again.', data.field);
              }
          } catch (error) {
              console.error('❌ Registration error:', error);
              if (error.name === 'TypeError' && error.message.includes('fetch')) {
                  showError('Cannot connect to server. Please check your internet connection.');
              } else {
                  showError('Registration failed. Please try again.');
              }
          } finally {
              showLoading(submitButton, false);
          }
      });
  }

  // Check if user is already logged in
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  
  if (token && user && (window.location.pathname.includes('login.html') || window.location.pathname.includes('register.html'))) {
      try {
          const userData = JSON.parse(user);
          console.log('User already logged in, redirecting...');
          
          // Redirect to appropriate dashboard
          let redirectUrl;
          switch (userData.role) {
              case 'tenant':
                  redirectUrl = 'tenant/dashboard_tenant.html';
                  break;
              case 'owner':
                  redirectUrl = 'owner/dashboard_owner.html';
                  break;
              case 'admin':
                  redirectUrl = 'admin/dashboard_admin.html';
                  break;
              default:
                  redirectUrl = 'tenant/dashboard_tenant.html';
          }
          
          window.location.href = redirectUrl;
      } catch (error) {
          console.error('Error parsing stored user data:', error);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
      }
  }
});