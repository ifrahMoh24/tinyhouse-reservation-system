// html-frontend/js/auth.js
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
  
    // LOGIN
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
  
        try {
          const res = await fetch('http://localhost:3001/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
  
          const data = await res.json();
          if (res.ok) {
            localStorage.setItem('token', data.token);
            // Redirect based on role
            const role = data.user.role; // "tenant" or "owner" or maybe "admin"
            if (role === 'tenant') {
              window.location.href = 'dashboard_tenant.html';
            } else if (role === 'owner') {
              window.location.href = 'dashboard_owner.html';
            } else {
              window.location.href = 'dashboard_admin.html';
            }
          } else {
            document.getElementById('errorMsg').textContent = data.message;
          }
        } catch (err) {
          document.getElementById('errorMsg').textContent = 'Login failed';
        }
      });
    }
  
    // REGISTER
    if (registerForm) {
      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
  
        // Read the two name fields separately
        const firstName = document.getElementById('firstName').value.trim();
        const lastName  = document.getElementById('lastName').value.trim();
        const email     = document.getElementById('email').value.trim();
        const password  = document.getElementById('password').value;
        const phone     = document.getElementById('phone').value.trim();  // optional
        const role      = document.getElementById('role').value;          // "tenant" or "owner"
  
        try {
          const res = await fetch('http://localhost:3001/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName, lastName, email, password, phone, userRole: role }),
          });
  
          const data = await res.json();
          if (res.ok) {
            localStorage.setItem('token', data.token);
            // Redirect based on role
            if (data.user.role === 'tenant') {
              window.location.href = 'dashboard_tenant.html';
            } else if (data.user.role === 'owner') {
              window.location.href = 'dashboard_owner.html';
            } else {
              window.location.href = 'dashboard_admin.html';
            }
          } else {
            document.getElementById('errorMsg').textContent = data.message;
          }
        } catch (err) {
          document.getElementById('errorMsg').textContent = 'Registration failed';
        }
      });
    }
  });
  