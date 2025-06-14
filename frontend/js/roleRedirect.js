// roleRedirect.js
function redirectByRole(role) {
    if (role === 'Kiracı') {
      window.location.href = 'dashboard_tenant.html';
    } else if (role === 'Ev Sahibi') {
      window.location.href = 'dashboard_owner.html';
    } else if (role === 'Admin') {
      window.location.href = 'dashboard_admin.html';
    } else {
      alert('Unknown role: ' + role);
      logout(); // fallback
    }
  }
  