// html-frontend/js/logout.js
function logout() {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
  }
  