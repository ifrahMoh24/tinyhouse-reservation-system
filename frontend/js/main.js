document.addEventListener('DOMContentLoaded', () => {
    const searchForm = document.getElementById('searchForm');
    const locationInput = document.getElementById('location');
    const checkInInput = document.getElementById('checkIn');
    const checkOutInput = document.getElementById('checkOut');
    const guestInput = document.getElementById('guests');
  
    const API_BASE_URL = 'http://localhost:3001';
  
    if (searchForm) {
      searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
  
        const location = locationInput.value.trim();
        const checkIn = checkInInput.value;
        const checkOut = checkOutInput.value;
        const guests = guestInput.value;
  
        if (!location) {
          alert('Please enter a location.');
          return;
        }
  
        const query = new URLSearchParams({
          city: location,
          checkIn,
          checkOut,
          guests
        }).toString();
  
        try {
          const res = await fetch(`${API_BASE_URL}/properties/search?${query}`);
          const data = await res.json();
  
          if (!res.ok) {
            alert(data.message || 'Error fetching results');
            return;
          }
  
          if (data.length === 0) {
            alert('No properties found.');
            return;
          }
  
          // Save results to localStorage and redirect to results page
          localStorage.setItem('searchResults', JSON.stringify(data));
          window.location.href = 'html-frontend/pages/properties.html';
  
        } catch (error) {
          console.error('Search error:', error);
          alert('Failed to fetch search results.');
        }
      });
    }
  });
  